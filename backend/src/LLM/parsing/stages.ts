import { randomUUID } from 'node:crypto';
import { createAgent } from '@llm-helpers/an-agent-runtime-handler';
import { defineTool } from '@llm-helpers/tools';
import type { LLMToolResponse } from '@llm-helpers/types';
import { z } from 'zod';
import { storyLocationsParseAgent } from '../../features/locations/parsing-agent.js';
import { storyMemoriesParseAgent } from '../../features/memories/parsing-agent.js';
import {
	storyCoreClueParseAgent,
	storyCoreConsolidationAgent,
} from '../../features/stories/parsing-agent.js';
import { extractJson } from '../../utils.js';
import {
	type normaliseCharacter,
	normaliseLocation,
	normaliseMemoryItem,
	normaliseStoryCore,
} from '../normalizers.js';
import { createOllamaRuntime } from '../runtime.js';
import { runCharacterDeepDiveAgent } from './agent-character.js';
import {
	buildStageToolSystem,
	type ChunkedPassContext,
	type ParsingMcpPolicy,
	type ParsingStageConfig,
	runChunkedPass,
	withConcurrencyLimit,
} from './chunked-pass.js';
import {
	identityEvidenceAgent,
	identityResolutionSchema,
} from './identity-agent.js';
import {
	buildCharacterExtractionPlans,
	buildCoreContextWindow,
	buildIdentityExtractionPlans,
	buildLocationChunkSelection,
	buildMemoryExtractionPlans,
	buildRelationshipExtractionPlans,
	type ChunkRoutingResult,
	type EntityExtractionPlan,
	type EntityManifest,
	type ParsingIndex,
	type StageSelectionPolicy,
} from './indexing.js';
import { relationshipEvidenceAgent } from './relationship-agent.js';
import type { ParseTraceEmitter } from './trace-types.js';
import type { ParseVerboseCallback } from './verbose-types.js';

export type NormalisedCharacter = ReturnType<typeof normaliseCharacter>;
export type NormalisedLocation = ReturnType<typeof normaliseLocation>;
export type NormalisedMemory = ReturnType<typeof normaliseMemoryItem>;
export type NormalisedStoryCore = ReturnType<typeof normaliseStoryCore>;
export type StoryParsingContext = { premise?: string };

export interface StoryStageRuntimeContext extends ChunkedPassContext {
	mcpPolicy?: ParsingMcpPolicy;
	onProgress?: (
		stage: string,
		status: 'start' | 'complete' | 'error',
		data?: Record<string, unknown>,
	) => void;
	onVerbose?: ParseVerboseCallback;
	signal?: AbortSignal;
	trace?: ParseTraceEmitter;
}

type StoryCoreClue = {
	chunkIndex: number;
	genres: string[];
	premiseClues: string[];
	rules: {
		characterRules: string[];
		storyRules: string[];
		worldRules: string[];
	};
	themes: string[];
	titleCandidates: string[];
	tone: string[];
	writingStyleHints: {
		dialogue: string;
		interiority: string;
		pacing: string;
		prose: string;
		sensory: string;
	};
};

type RelationshipEvidence = {
	chunkIndex: number;
	emotion: string;
	fromCharacter: string;
	privateAttitude: string;
	publicAttitude: string;
	toCharacter: string;
	trustLevel: number;
};

type IdentityEvidence = {
	characterName: string;
	chunkIndex: number;
	identities: Array<{
		abilities: string[];
		appearance?: string;
		conditions?: string;
		name: string;
		notes?: string;
		selfAware: boolean;
	}>;
	linkedCharacterNames: string[];
};

type LocationCandidate = NormalisedLocation & {
	chunkIndex: number;
};

type MemoryCandidate = NormalisedMemory & {
	chunkIndex: number;
};

const PARSE_LLM_RETRY_COUNT = 1;
const PARSE_LLM_TIMEOUT_MS = 180_000;
const STAGE_MCP_FALLBACK: ParsingMcpPolicy = {
	enabled: false,
	fallback: 'local-only',
	stageTools: {},
};

const CORE_SELECTION_POLICY: StageSelectionPolicy = {
	fallbackToSalientChunks: true,
	minimumChunks: 4,
	selectionLimit: 6,
};

const LOCATION_SELECTION_POLICY: StageSelectionPolicy = {
	fallbackToSalientChunks: true,
	minimumChunks: 4,
	neighborSpillover: 1,
	selectionLimit: 8,
};

const CHARACTER_SELECTION_POLICY: StageSelectionPolicy = {
	fallbackToSalientChunks: true,
	minimumChunks: 2,
	neighborSpillover: 1,
	selectionLimit: 4,
};

const RELATIONSHIP_SELECTION_POLICY: StageSelectionPolicy = {
	fallbackToSalientChunks: false,
	minimumChunks: 1,
	selectionLimit: 4,
};

const MEMORY_SELECTION_POLICY: StageSelectionPolicy = {
	fallbackToSalientChunks: true,
	minimumChunks: 2,
	neighborSpillover: 1,
	selectionLimit: 5,
};

const IDENTITY_SELECTION_POLICY: StageSelectionPolicy = {
	fallbackToSalientChunks: false,
	minimumChunks: 1,
	selectionLimit: 4,
};

function clampTrust(value: number): number {
	return Math.max(0, Math.min(10, Math.round(value)));
}

function mergeUniqueStrings(values: string[]): string[] {
	const seen = new Set<string>();
	const merged: string[] = [];
	for (const value of values) {
		const trimmed = value.trim();
		const key = trimmed.toLowerCase();
		if (!key || seen.has(key)) continue;
		seen.add(key);
		merged.push(trimmed);
	}
	return merged;
}

function pickRichestString(values: Array<string | null | undefined>): string {
	return (
		values
			.map((value) => value?.trim() ?? '')
			.filter(Boolean)
			.sort((a, b) => b.length - a.length)[0] ?? ''
	);
}

function buildPromptRunOptions(
	context: StoryStageRuntimeContext,
	stage: string,
	agent: string,
	scope: string,
	onVerbose?: (
		event: import('../prompt-runners/create-prompt-runner.js').PromptRunnerVerboseEvent,
	) => void,
) {
	return {
		onVerbose,
		retryCount: PARSE_LLM_RETRY_COUNT,
		signal: context.signal,
		timeoutMs: PARSE_LLM_TIMEOUT_MS,
		trace: context.trace,
		traceAgent: agent,
		traceScope: scope,
		traceStage: stage,
	};
}

function buildStageContext(
	context: StoryStageRuntimeContext,
): ChunkedPassContext {
	return {
		mcpPolicy: context.mcpPolicy,
		onVerbose: context.onVerbose,
		signal: context.signal,
		timeoutMs: PARSE_LLM_TIMEOUT_MS,
		trace: context.trace,
	};
}

async function emitAgentTrace(
	trace: ParseTraceEmitter | undefined,
	kind: 'agent_start' | 'agent_complete' | 'agent_error' | 'agent_handoff',
	stage: string,
	payload: Record<string, unknown>,
) {
	await trace?.emit({
		kind,
		payload,
		stage,
	});
}

async function emitStageWarning(
	context: StoryStageRuntimeContext,
	stage: string,
	message: string,
) {
	await context.trace?.emit({
		kind: 'warning',
		payload: { message },
		stage,
	});
}

async function emitRoutingTrace(
	trace: ParseTraceEmitter | undefined,
	kind: 'routing_start' | 'routing_complete' | 'routing_error',
	stage: string,
	payload: Record<string, unknown>,
) {
	await trace?.emit({
		kind,
		payload,
		stage,
	});
}

async function emitEntityRouted(
	trace: ParseTraceEmitter | undefined,
	stage: string,
	plan: EntityExtractionPlan,
	index: ParsingIndex,
) {
	await trace?.emit({
		kind: 'entity_routed',
		payload: {
			candidateChunkCount: plan.candidateChunkCount,
			chunkCount: plan.chunkIndices.length,
			chunkIndices: plan.chunkIndices.map((chunkIndex) => chunkIndex + 1),
			entityKey: plan.entityKey,
			entityLabel: plan.entityLabel,
			fallbackUsed: plan.fallbackUsed,
			preSpilloverSelectedCount: plan.preSpilloverSelectedCount,
			reason: plan.reason,
			spilloverAddedCount: plan.spilloverAddedCount,
			totalChunkCount: index.chunks.length,
		},
		stage,
	});
}

async function traceRoutingResult(
	trace: ParseTraceEmitter | undefined,
	result: ChunkRoutingResult,
	index: ParsingIndex,
) {
	await emitRoutingTrace(trace, 'routing_start', result.stage, {
		candidateCountBeforeSelection: result.candidateCountBeforeSelection,
		totalChunkCount: index.chunks.length,
	});
	for (const plan of result.entityPlans) {
		await emitEntityRouted(trace, result.stage, plan, index);
	}
	await emitRoutingTrace(trace, 'routing_complete', result.stage, {
		candidateCountAfterSelection: result.candidateCountAfterSelection,
		candidateCountBeforeSelection: result.candidateCountBeforeSelection,
		selectedChunkIndices: result.selectedChunkIndices.map(
			(chunkIndex) => chunkIndex + 1,
		),
		totalChunkCount: index.chunks.length,
	});
}

function summariseLlmResponse(response: LLMToolResponse): string {
	const text = response.text.trim();
	return text.length > 1200 ? `${text.slice(0, 1200)}…` : text;
}

function identityEvidenceSummary(evidence: IdentityEvidence[]) {
	const grouped = new Map<
		string,
		{
			identityCount: number;
			linkNames: Set<string>;
		}
	>();

	for (const entry of evidence) {
		const group = grouped.get(entry.characterName) ?? {
			identityCount: 0,
			linkNames: new Set<string>(),
		};
		group.identityCount += entry.identities.length;
		entry.linkedCharacterNames.forEach((name) => {
			group.linkNames.add(name);
		});
		grouped.set(entry.characterName, group);
	}

	return [...grouped.entries()].map(([characterName, info]) => ({
		characterName,
		identityCount: info.identityCount,
		linkedCharacterCount: info.linkNames.size,
	}));
}

async function runIdentityResolutionAgent(
	evidence: IdentityEvidence[],
	context: StoryStageRuntimeContext,
): Promise<
	Array<{
		characterName: string;
		identities: Array<{
			abilities: string[];
			appearance?: string;
			conditions?: string;
			name: string;
			notes?: string;
			selfAware: boolean;
		}>;
		linkedCharacterNames: string[];
	}>
> {
	const localTools = [
		defineTool({
			description:
				'List characters that have identity evidence and how much evidence exists for each one.',
			execute: async () => identityEvidenceSummary(evidence),
			input: z.object({}),
			name: 'identity_evidence.list',
		}),
		defineTool({
			description:
				'Get detailed identity evidence for a specific character.',
			execute: async ({ characterName }) =>
				evidence.filter(
					(entry) =>
						entry.characterName.toLowerCase() ===
						characterName.toLowerCase(),
				),
			input: z.object({
				characterName: z.string(),
			}),
			name: 'identity_evidence.get',
		}),
	];

	const tools = await buildStageToolSystem(
		'story.identities',
		{
			...buildStageContext(context),
			mcpPolicy: context.mcpPolicy ?? STAGE_MCP_FALLBACK,
		},
		localTools,
	);

	const runtime = await createOllamaRuntime({ numCtx: 16384 });
	const trace = context.trace;
	if (!tools) {
		throw new Error('Identity resolution tools could not be initialized');
	}

	const agent = createAgent(runtime.provider, tools, {
		hooks: {
			afterLLMCall: async (response) => {
				await trace?.emit({
					kind: 'llm_response',
					payload: {
						agent: 'identity-resolver',
						durationMs: response.usage?.totalTokens ?? null,
						rawText: summariseLlmResponse(response),
						scope: 'story.identities.reducer',
						usage: response.usage ?? null,
					},
					stage: 'story.identities',
				});
				return response;
			},
			beforeLLMCall: async (request) => {
				await trace?.emit({
					kind: 'llm_request',
					payload: {
						agent: 'identity-resolver',
						model: runtime.defaultModel,
						numCtx: 16384,
						prompt: request.messages.at(-1)?.content ?? '',
						schemaName: 'identity resolver',
						scope: 'story.identities.reducer',
						temperature: request.temperature ?? 0.1,
					},
					stage: 'story.identities',
				});
				return request;
			},
		},
		maxSteps: 6,
		onToolError: 'continue',
	});

	agent.bus.on('tool_call', (event) => {
		void trace?.emit({
			kind: 'tool_call',
			payload: {
				args: event.args,
				name: event.toolName,
			},
			stage: 'story.identities',
		});
	});
	agent.bus.on('tool_result', (event) => {
		void trace?.emit({
			kind: 'tool_result',
			payload: {
				name: event.toolName,
				result: event.result,
			},
			stage: 'story.identities',
		});
	});
	agent.bus.on('tool_error', (event) => {
		void trace?.emit({
			kind: 'tool_error',
			payload: {
				error:
					event.error instanceof Error
						? event.error.message
						: String(event.error),
				name: event.toolName,
			},
			stage: 'story.identities',
		});
	});

	await emitAgentTrace(trace, 'agent_start', 'story.identities', {
		agent: 'identity-resolver',
		evidenceCount: evidence.length,
	});

	try {
		const history = await agent.start({
			messages: [
				{
					content: [
						'You are resolving character identities from structured evidence.',
						'Use the identity_evidence tools to inspect the candidates.',
						'Only include explicit, well-supported links or identities.',
						'Return ONLY valid JSON matching the provided schema.',
						JSON.stringify(
							z.toJSONSchema(identityResolutionSchema),
							null,
							2,
						),
					].join('\n\n'),
					role: 'system',
				},
				{
					content:
						'Resolve the final set of linked identities for this story from the available evidence.',
					role: 'user',
				},
			],
			signal: context.signal,
			temperature: 0.1,
		});
		const assistantText =
			[...history].reverse().find((entry) => entry.role === 'assistant')
				?.content ?? '{"links":[]}';
		const parsed = identityResolutionSchema.parse(
			extractJson(assistantText),
		);
		await emitAgentTrace(trace, 'agent_complete', 'story.identities', {
			agent: 'identity-resolver',
			linkCount: parsed.links.length,
		});
		return parsed.links;
	} catch (error) {
		await emitAgentTrace(trace, 'agent_error', 'story.identities', {
			agent: 'identity-resolver',
			message: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}

function cloneCharacters(
	characters: NormalisedCharacter[],
): NormalisedCharacter[] {
	return characters.map((character) => ({
		...character,
		identities: character.identities.map((identity) => ({
			...identity,
			abilities: [...identity.abilities],
			knownBy: [...identity.knownBy],
		})),
		linkedCharacterNames: [...character.linkedCharacterNames],
		relationships: character.relationships.map((relationship) => ({
			...relationship,
		})),
	}));
}

function matchRelationshipPlan(
	entry: RelationshipEvidence,
	left: string,
	right: string,
): boolean {
	const values = [
		entry.fromCharacter.toLowerCase(),
		entry.toCharacter.toLowerCase(),
	].sort((a, b) => a.localeCompare(b));
	const expected = [left.toLowerCase(), right.toLowerCase()].sort((a, b) =>
		a.localeCompare(b),
	);
	return values[0] === expected[0] && values[1] === expected[1];
}

function mergeRelationshipEvidence(
	candidates: RelationshipEvidence[],
): RelationshipEvidence[] {
	const groups = new Map<string, RelationshipEvidence[]>();
	for (const candidate of candidates) {
		const key = `${candidate.fromCharacter.toLowerCase()}::${candidate.toCharacter.toLowerCase()}`;
		const existing = groups.get(key) ?? [];
		existing.push(candidate);
		groups.set(key, existing);
	}

	return [...groups.values()].map((group) => {
		const textMode = (values: string[]) => {
			const counts = new Map<string, number>();
			for (const value of values.filter(Boolean)) {
				counts.set(value, (counts.get(value) ?? 0) + 1);
			}
			return (
				[...counts.entries()].sort((left, right) => {
					if (right[1] !== left[1]) return right[1] - left[1];
					return right[0].length - left[0].length;
				})[0]?.[0] ?? ''
			);
		};

		return {
			chunkIndex: group[0].chunkIndex,
			emotion: textMode(group.map((entry) => entry.emotion)),
			fromCharacter: group[0].fromCharacter,
			privateAttitude: textMode(
				group.map((entry) => entry.privateAttitude),
			),
			publicAttitude: textMode(
				group.map((entry) => entry.publicAttitude),
			),
			toCharacter: group[0].toCharacter,
			trustLevel: clampTrust(
				group.reduce((sum, entry) => sum + entry.trustLevel, 0) /
					group.length,
			),
		};
	});
}

function mergeMemoryCandidates(
	candidates: MemoryCandidate[],
): NormalisedMemory[] {
	const groups = new Map<string, MemoryCandidate[]>();
	for (const candidate of candidates) {
		const key = `${candidate.characterName.toLowerCase()}::${candidate.summary.toLowerCase()}`;
		const existing = groups.get(key) ?? [];
		existing.push(candidate);
		groups.set(key, existing);
	}

	const merged = [...groups.values()].map((group) => {
		const effectMap = new Map<
			string,
			NormalisedMemory['deltas']['effects'][number]
		>();
		for (const candidate of group) {
			for (const effect of candidate.deltas.effects) {
				const key = JSON.stringify(effect);
				if (!effectMap.has(key)) effectMap.set(key, effect);
			}
		}
		return {
			characterName: group[0].characterName,
			deltas: { effects: [...effectMap.values()] },
			importance: Math.max(
				...group.map((candidate) => candidate.importance),
			),
			isGenesis: group.some((candidate) => candidate.isGenesis),
			sceneId:
				mergeUniqueStrings(
					group
						.map((candidate) => candidate.sceneId ?? '')
						.filter(Boolean),
				)[0] ?? null,
			storyOrder: Math.min(
				...group.map((candidate) =>
					candidate.storyOrder > 0
						? candidate.storyOrder
						: Number.MAX_SAFE_INTEGER,
				),
			),
			summary: group[0].summary,
			tags: mergeUniqueStrings(
				group.flatMap((candidate) => candidate.tags),
			),
		};
	});

	return merged
		.sort((left, right) => {
			const leftOrder =
				left.storyOrder === Number.MAX_SAFE_INTEGER
					? Number.MAX_SAFE_INTEGER
					: left.storyOrder;
			const rightOrder =
				right.storyOrder === Number.MAX_SAFE_INTEGER
					? Number.MAX_SAFE_INTEGER
					: right.storyOrder;
			if (leftOrder !== rightOrder) return leftOrder - rightOrder;
			return left.summary.localeCompare(right.summary);
		})
		.map((memory, index) => ({
			...memory,
			storyOrder: index + 1,
		}));
}

function parseIdentityEvidenceChunk(
	result: Record<string, unknown>,
	chunkIndex: number,
): IdentityEvidence[] {
	const raw = Array.isArray(result.links) ? (result.links as unknown[]) : [];
	return raw
		.filter(
			(item): item is Record<string, unknown> =>
				typeof item === 'object' && item !== null,
		)
		.map((item) => {
			type RawIdentity = {
				abilities?: unknown;
				appearance?: unknown;
				conditions?: unknown;
				name: string;
				notes?: unknown;
				selfAware?: unknown;
			};
			return {
				characterName:
					typeof item.characterName === 'string'
						? item.characterName
						: '',
				chunkIndex: chunkIndex + 1,
				identities: Array.isArray(item.identities)
					? (item.identities as unknown[])
							.filter(
								(identity): identity is RawIdentity =>
									typeof identity === 'object' &&
									identity !== null &&
									'name' in identity &&
									typeof (identity as { name?: unknown })
										.name === 'string',
							)
							.map((identity) => ({
								abilities: Array.isArray(identity.abilities)
									? (identity.abilities as unknown[]).filter(
											(value): value is string =>
												typeof value === 'string',
										)
									: [],
								appearance:
									typeof identity.appearance === 'string'
										? identity.appearance
										: '',
								conditions:
									typeof identity.conditions === 'string'
										? identity.conditions
										: '',
								name: identity.name as string,
								notes:
									typeof identity.notes === 'string'
										? identity.notes
										: '',
								selfAware: identity.selfAware !== false,
							}))
					: [],
				linkedCharacterNames: Array.isArray(item.linkedCharacterNames)
					? (item.linkedCharacterNames as unknown[]).filter(
							(value): value is string =>
								typeof value === 'string',
						)
					: [],
			};
		})
		.filter((entry) => !!entry.characterName);
}

function reduceIdentityEvidenceDeterministically(
	evidence: IdentityEvidence[],
): Array<{
	characterName: string;
	identities: IdentityEvidence['identities'];
	linkedCharacterNames: string[];
}> {
	const grouped = new Map<string, IdentityEvidence[]>();
	for (const entry of evidence) {
		const key = entry.characterName.toLowerCase();
		const existing = grouped.get(key) ?? [];
		existing.push(entry);
		grouped.set(key, existing);
	}

	return [...grouped.entries()].map(([characterKey, group]) => {
		const identityMap = new Map<
			string,
			IdentityEvidence['identities'][number]
		>();
		const linkedCharacterNames = mergeUniqueStrings(
			group.flatMap((entry) => entry.linkedCharacterNames),
		).filter((value) => value.toLowerCase() !== characterKey);

		for (const entry of group) {
			for (const identity of entry.identities) {
				const key = identity.name.toLowerCase();
				if (identityMap.has(key)) continue;
				identityMap.set(key, identity);
			}
		}

		return {
			characterName: group[0].characterName,
			identities: [...identityMap.values()],
			linkedCharacterNames,
		};
	});
}

const storyCoreStageReducer = {
	description: 'Consolidate chunk-level story core clues',
	run: async (
		clues: StoryCoreClue[],
		context: ChunkedPassContext,
	): Promise<NormalisedStoryCore> => {
		const mergedInput = {
			chunkClues: clues.map((clue) => ({
				...clue,
			})),
		};
		const data = await storyCoreConsolidationAgent.run(
			`Chunk-level story core clues:\n${JSON.stringify(mergedInput, null, 2)}`,
			buildPromptRunOptions(
				context as StoryStageRuntimeContext,
				'story.core+locations',
				'story-core-consolidator',
				'story.core.reducer',
				context.onVerbose
					? (event) =>
							context.onVerbose?.({
								agent: 'story-core-consolidator',
								...event,
							})
					: undefined,
			),
		);
		return normaliseStoryCore(data, {
			includePremise: true,
			includeTitle: true,
		});
	},
};

const storyCoreStage: ParsingStageConfig<
	{
		index: ParsingIndex;
		premise?: string;
	},
	NormalisedStoryCore,
	StoryStageRuntimeContext
> = {
	description: 'Chunked story core extraction and consolidation',
	name: 'story.core',
	run: async ({ index, premise }, context) => {
		const coreWindow = buildCoreContextWindow(index, CORE_SELECTION_POLICY);
		const routed = {
			candidateCountAfterSelection:
				coreWindow.selectedChunkIndices.length,
			candidateCountBeforeSelection: index.chunks.length,
			entityPlans: [
				{
					candidateChunkCount: index.chunks.length,
					chunkIndices: coreWindow.selectedChunkIndices,
					chunks: coreWindow.selectedChunkIndices.map(
						(chunkIndex) => index.chunks[chunkIndex],
					),
					entityKey: 'story.core',
					entityLabel: 'story.core',
					fallbackUsed: false,
					preSpilloverSelectedCount:
						coreWindow.selectedChunkIndices.length,
					reason: 'scene_markers_and_salience',
					spilloverAddedCount: 0,
				},
			],
			selectedChunkIndices: coreWindow.selectedChunkIndices,
			stage: 'story.core+locations',
		} satisfies ChunkRoutingResult;
		await traceRoutingResult(context.trace, routed, index);

		const prefixParts: string[] = [];
		if (premise) prefixParts.push(`Story premise: ${premise}`);
		if (coreWindow.manifest.characterNames.length) {
			prefixParts.push(
				`Known characters: ${coreWindow.manifest.characterNames.join(', ')}`,
			);
		}
		if (coreWindow.manifest.locationNames.length) {
			prefixParts.push(
				`Known locations: ${coreWindow.manifest.locationNames.join(', ')}`,
			);
		}
		if (coreWindow.sceneMarkers.length) {
			prefixParts.push(
				`Top scene markers: ${coreWindow.sceneMarkers.join(', ')}`,
			);
		}
		if (coreWindow.summaries.length) {
			prefixParts.push(
				`Top chunk summaries:\n- ${coreWindow.summaries.join('\n- ')}`,
			);
		}
		const contextPrefix = prefixParts.join('\n\n');

		return runChunkedPass<StoryCoreClue, NormalisedStoryCore>(
			{
				buildPrompt: (chunk, index, total) =>
					[
						contextPrefix,
						`Story text (section ${index + 1} of ${total}):\n${chunk}`,
						'Extract only chunk-local story core clues. Respond with ONLY the JSON object.',
					]
						.filter(Boolean)
						.join('\n\n'),
				chunkInput: {
					chunks: index.chunks,
					maxChars: 3000,
					overlapChars: 300,
				},
				chunkSelector: coreWindow.selectedChunkIndices,
				dedupeBy: (candidate) =>
					JSON.stringify({
						chunkIndex: candidate.chunkIndex,
						genres: candidate.genres,
						premiseClues: candidate.premiseClues,
						rules: candidate.rules,
						themes: candidate.themes,
						titleCandidates: candidate.titleCandidates,
						tone: candidate.tone,
						writingStyleHints: candidate.writingStyleHints,
					}),
				extractor: storyCoreClueParseAgent,
				maxConcurrency: 2,
				parseChunk: (result, chunkIndex) => [
					{
						chunkIndex: chunkIndex + 1,
						genres: Array.isArray(result.genres)
							? result.genres.filter(
									(value): value is string =>
										typeof value === 'string',
								)
							: [],
						premiseClues: Array.isArray(result.premiseClues)
							? result.premiseClues.filter(
									(value): value is string =>
										typeof value === 'string',
								)
							: [],
						rules: {
							characterRules: Array.isArray(
								(
									result.rules as
										| Record<string, unknown>
										| undefined
								)?.characterRules,
							)
								? (
										(
											result.rules as Record<
												string,
												unknown
											>
										).characterRules as unknown[]
									).filter(
										(value): value is string =>
											typeof value === 'string',
									)
								: [],
							storyRules: Array.isArray(
								(
									result.rules as
										| Record<string, unknown>
										| undefined
								)?.storyRules,
							)
								? (
										(
											result.rules as Record<
												string,
												unknown
											>
										).storyRules as unknown[]
									).filter(
										(value): value is string =>
											typeof value === 'string',
									)
								: [],
							worldRules: Array.isArray(
								(
									result.rules as
										| Record<string, unknown>
										| undefined
								)?.worldRules,
							)
								? (
										(
											result.rules as Record<
												string,
												unknown
											>
										).worldRules as unknown[]
									).filter(
										(value): value is string =>
											typeof value === 'string',
									)
								: [],
						},
						themes: Array.isArray(result.themes)
							? result.themes.filter(
									(value): value is string =>
										typeof value === 'string',
								)
							: [],
						titleCandidates: Array.isArray(result.titleCandidates)
							? result.titleCandidates.filter(
									(value): value is string =>
										typeof value === 'string',
								)
							: [],
						tone: Array.isArray(result.tone)
							? result.tone.filter(
									(value): value is string =>
										typeof value === 'string',
								)
							: [],
						writingStyleHints: (() => {
							const hints =
								typeof result.writingStyleHints === 'object' &&
								result.writingStyleHints !== null
									? (result.writingStyleHints as Record<
											string,
											unknown
										>)
									: {};
							return {
								dialogue:
									typeof hints.dialogue === 'string'
										? hints.dialogue
										: '',
								interiority:
									typeof hints.interiority === 'string'
										? hints.interiority
										: '',
								pacing:
									typeof hints.pacing === 'string'
										? hints.pacing
										: '',
								prose:
									typeof hints.prose === 'string'
										? hints.prose
										: '',
								sensory:
									typeof hints.sensory === 'string'
										? hints.sensory
										: '',
							};
						})(),
					},
				],
				promptScope: 'story.core',
				reducer: storyCoreStageReducer,
				retryCount: 1,
				stage: 'story.core+locations',
				traceAgent: 'story-core-clues',
			},
			buildStageContext(context),
		);
	},
};

const storyCensusStage: ParsingStageConfig<
	{
		index: ParsingIndex;
	},
	EntityManifest,
	StoryStageRuntimeContext
> = {
	description: 'Manifest read from the shared story index',
	name: 'story.census',
	run: async ({ index }) => index.manifest,
};

const storyLocationsStage: ParsingStageConfig<
	{
		index: ParsingIndex;
		premise?: string;
	},
	NormalisedLocation[],
	StoryStageRuntimeContext
> = {
	description: 'Chunked location extraction and consolidation',
	name: 'story.locations',
	run: async ({ index, premise }, context) => {
		const routing = buildLocationChunkSelection(
			index,
			LOCATION_SELECTION_POLICY,
		);
		await traceRoutingResult(context.trace, routing, index);
		const manifest = index.manifest;
		const prefixParts: string[] = [];
		if (premise) prefixParts.push(`Story premise: ${premise}`);
		if (manifest.locationNames.length) {
			prefixParts.push(
				`Expected locations: ${manifest.locationNames.join(', ')}`,
			);
		}
		const contextPrefix = prefixParts.join('\n\n');

		return runChunkedPass<LocationCandidate, NormalisedLocation[]>(
			{
				buildPrompt: (chunk, index, total) =>
					[
						contextPrefix,
						`Story text (section ${index + 1} of ${total}):\n${chunk}`,
						'Respond with ONLY the JSON object. No other text.',
					]
						.filter(Boolean)
						.join('\n\n'),
				chunkInput: {
					chunks: index.chunks,
					maxChars: 3000,
					overlapChars: 300,
				},
				chunkSelector: routing.selectedChunkIndices,
				dedupeBy: (candidate) => candidate.name.toLowerCase(),
				extractor: storyLocationsParseAgent,
				maxConcurrency: 2,
				parseChunk: (result, chunkIndex) => {
					const raw = Array.isArray(result.locations)
						? (result.locations as unknown[])
						: [];
					return raw
						.filter(
							(item): item is Record<string, unknown> =>
								typeof item === 'object' && item !== null,
						)
						.map((item) => ({
							...normaliseLocation(item),
							chunkIndex: chunkIndex + 1,
						}))
						.filter((location) => !!location.name);
				},
				promptScope: 'story.locations',
				reducer: {
					description:
						'Merge duplicate locations and relationship fields',
					run: async (candidates) => {
						const groups = new Map<string, LocationCandidate[]>();
						for (const candidate of candidates) {
							const key = candidate.name.toLowerCase();
							const existing = groups.get(key) ?? [];
							existing.push(candidate);
							groups.set(key, existing);
						}
						return [...groups.values()].map((group) => ({
							atmosphere: pickRichestString(
								group.map((item) => item.atmosphere),
							),
							connectedLocationNames: mergeUniqueStrings(
								group.flatMap(
									(item) => item.connectedLocationNames,
								),
							),
							description: pickRichestString(
								group.map((item) => item.description),
							),
							layout: pickRichestString(
								group.map((item) => item.layout),
							),
							lighting: pickRichestString(
								group.map((item) => item.lighting),
							),
							name: group[0].name,
							notes: pickRichestString(
								group.map((item) => item.notes),
							),
							parentLocationName:
								mergeUniqueStrings(
									group
										.map(
											(item) =>
												item.parentLocationName ?? '',
										)
										.filter(Boolean),
								)[0] ?? null,
							smells: pickRichestString(
								group.map((item) => item.smells),
							),
							soundscape: pickRichestString(
								group.map((item) => item.soundscape),
							),
							tags: mergeUniqueStrings(
								group.flatMap((item) => item.tags),
							),
						}));
					},
				},
				retryCount: 1,
				stage: 'story.core+locations',
				traceAgent: 'locations',
			},
			buildStageContext(context),
		);
	},
};

const storyCharactersStage: ParsingStageConfig<
	{
		characterNames: string[];
		index: ParsingIndex;
		premise?: string;
	},
	NormalisedCharacter[],
	StoryStageRuntimeContext
> = {
	description: 'Deterministic per-character deep dive',
	name: 'story.characters',
	run: async ({ characterNames, index, premise }, context) => {
		const routing = buildCharacterExtractionPlans(
			index,
			characterNames,
			CHARACTER_SELECTION_POLICY,
		);
		await traceRoutingResult(context.trace, routing, index);
		return runCharacterDeepDiveAgent(
			routing.entityPlans.map((plan) => ({
				chunkIndices: plan.chunkIndices,
				chunks: plan.chunks,
				name: plan.entityLabel,
			})),
			premise ? { premise } : undefined,
			context.onProgress
				? (name, status) =>
						context.onProgress?.('story.character', status, {
							characterName: name,
						})
				: undefined,
			context.onVerbose,
			context.signal,
			context.trace,
		);
	},
};

const storyRelationshipsStage: ParsingStageConfig<
	{
		characters: NormalisedCharacter[];
		index: ParsingIndex;
		premise?: string;
	},
	NormalisedCharacter[],
	StoryStageRuntimeContext
> = {
	description: 'Chunked relationship evidence extraction and merge',
	name: 'story.relationships',
	run: async ({ characters, index, premise }, context) => {
		if (characters.length === 0) return characters;
		const nextCharacters = cloneCharacters(characters);
		const routing = buildRelationshipExtractionPlans(
			index,
			characters.map((character) => character.name),
			RELATIONSHIP_SELECTION_POLICY,
		);
		await traceRoutingResult(context.trace, routing, index);
		if (routing.entityPlans.length === 0) return nextCharacters;

		const characterList = characters
			.map((character) => character.name)
			.join(', ');
		const prefixParts: string[] = [];
		if (premise) prefixParts.push(`Story premise: ${premise}`);
		prefixParts.push(`Known characters: ${characterList}`);
		const contextPrefix = prefixParts.join('\n\n');
		const evidenceByPlan = await withConcurrencyLimit(
			routing.entityPlans.map((plan) => async () => {
				const [left, right] = plan.entityLabel.split(' <-> ');
				return runChunkedPass<
					RelationshipEvidence,
					RelationshipEvidence[]
				>(
					{
						buildPrompt: (chunk, chunkIndex, total) =>
							[
								contextPrefix,
								`Focus only on relationship evidence involving ${left} and ${right}.`,
								`Story text (section ${chunkIndex + 1} of ${total}):\n${chunk}`,
								'Extract only relationship evidence supported by this chunk. Respond with ONLY the JSON object.',
							]
								.filter(Boolean)
								.join('\n\n'),
						chunkInput: {
							chunks: index.chunks,
							maxChars: 3000,
							overlapChars: 300,
						},
						chunkSelector: plan.chunkIndices,
						dedupeBy: (candidate) =>
							`${candidate.fromCharacter.toLowerCase()}::${candidate.toCharacter.toLowerCase()}::${candidate.emotion.toLowerCase()}::${candidate.publicAttitude.toLowerCase()}::${candidate.privateAttitude.toLowerCase()}::${candidate.trustLevel}`,
						extractor: relationshipEvidenceAgent,
						maxConcurrency: 2,
						parseChunk: (result, chunkIndex) => {
							const raw = Array.isArray(result.relationships)
								? (result.relationships as unknown[])
								: [];
							return raw
								.filter(
									(item): item is Record<string, unknown> =>
										typeof item === 'object' &&
										item !== null,
								)
								.map((item) => ({
									chunkIndex: chunkIndex + 1,
									emotion:
										typeof item.emotion === 'string'
											? item.emotion
											: '',
									fromCharacter:
										typeof item.fromCharacter === 'string'
											? item.fromCharacter
											: '',
									privateAttitude:
										typeof item.privateAttitude === 'string'
											? item.privateAttitude
											: '',
									publicAttitude:
										typeof item.publicAttitude === 'string'
											? item.publicAttitude
											: '',
									toCharacter:
										typeof item.toCharacter === 'string'
											? item.toCharacter
											: '',
									trustLevel:
										typeof item.trustLevel === 'number'
											? item.trustLevel
											: 5,
								}))
								.filter(
									(entry) =>
										!!entry.fromCharacter &&
										!!entry.toCharacter &&
										matchRelationshipPlan(
											entry,
											left,
											right,
										),
								);
						},
						promptScope: 'story.relationships',
						retryCount: 1,
						stage: 'story.relationships',
						traceAgent: `relationship-evidence:${plan.entityKey}`,
					},
					buildStageContext(context),
				);
			}),
			2,
		);
		const merged = mergeRelationshipEvidence(evidenceByPlan.flat());

		for (const evidence of merged) {
			const fromCharacter = nextCharacters.find(
				(character) =>
					character.name.toLowerCase() ===
					evidence.fromCharacter.toLowerCase(),
			);
			if (!fromCharacter) continue;
			const existing = fromCharacter.relationships.find(
				(relationship) =>
					relationship.otherCharacterName.toLowerCase() ===
					evidence.toCharacter.toLowerCase(),
			);
			if (existing) {
				existing.emotion = evidence.emotion || existing.emotion;
				existing.privateAttitude =
					evidence.privateAttitude || existing.privateAttitude;
				existing.publicAttitude =
					evidence.publicAttitude || existing.publicAttitude;
				existing.trustLevel = evidence.trustLevel;
			} else {
				fromCharacter.relationships.push({
					emotion: evidence.emotion,
					otherCharacterName: evidence.toCharacter,
					privateAttitude: evidence.privateAttitude,
					publicAttitude: evidence.publicAttitude,
					trustLevel: evidence.trustLevel,
				});
			}
		}

		return nextCharacters;
	},
};

const storyMemoriesStage: ParsingStageConfig<
	{
		characters: NormalisedCharacter[];
		index: ParsingIndex;
		premise?: string;
	},
	NormalisedMemory[],
	StoryStageRuntimeContext
> = {
	description: 'Chunked memory extraction and deterministic timeline merge',
	name: 'story.memories',
	run: async ({ characters, index, premise }, context) => {
		const routing = buildMemoryExtractionPlans(
			index,
			characters.map((character) => character.name),
			MEMORY_SELECTION_POLICY,
		);
		await traceRoutingResult(context.trace, routing, index);
		if (routing.entityPlans.length === 0) return [];

		const manifest = index.manifest;
		const charList = characters
			.map((character) => character.name)
			.join(', ');
		const prefixParts: string[] = [];
		if (premise) prefixParts.push(`Story premise: ${premise}`);
		prefixParts.push(`Known characters: ${charList}`);
		if (manifest.sceneNames.length) {
			prefixParts.push(`Known scenes: ${manifest.sceneNames.join(', ')}`);
		}
		const contextPrefix = prefixParts.join('\n\n');

		const memoriesByPlan = await withConcurrencyLimit(
			routing.entityPlans.map(
				(plan) => async () =>
					runChunkedPass<MemoryCandidate, MemoryCandidate[]>(
						{
							buildPrompt: (chunk, chunkIndex, total) =>
								[
									contextPrefix,
									`Focus only on events involving ${plan.entityLabel}.`,
									`Story text (section ${chunkIndex + 1} of ${total}):\n${chunk}`,
									'Respond with ONLY the JSON object. No other text.',
								]
									.filter(Boolean)
									.join('\n\n'),
							chunkInput: {
								chunks: index.chunks,
								maxChars: 3000,
								overlapChars: 300,
							},
							chunkSelector: plan.chunkIndices,
							dedupeBy: (candidate) =>
								`${candidate.characterName.toLowerCase()}::${candidate.summary.toLowerCase()}`,
							extractor: storyMemoriesParseAgent,
							maxConcurrency: 2,
							parseChunk: (result, chunkIndex) => {
								const raw = Array.isArray(result.memories)
									? (result.memories as unknown[])
									: [];
								return raw
									.filter(
										(
											item,
										): item is Record<string, unknown> =>
											typeof item === 'object' &&
											item !== null,
									)
									.map((item) => ({
										...normaliseMemoryItem(item),
										chunkIndex: chunkIndex + 1,
									}))
									.filter(
										(memory) =>
											!!memory.characterName &&
											!!memory.summary &&
											memory.characterName.toLowerCase() ===
												plan.entityLabel.toLowerCase(),
									);
							},
							promptScope: 'story.memories',
							retryCount: 1,
							stage: 'story.memories',
							traceAgent: `memories:${plan.entityKey}`,
						},
						buildStageContext(context),
					),
			),
			2,
		);

		return mergeMemoryCandidates(memoriesByPlan.flat());
	},
};

const storyIdentitiesStage: ParsingStageConfig<
	{
		characters: NormalisedCharacter[];
		index: ParsingIndex;
		premise?: string;
	},
	NormalisedCharacter[],
	StoryStageRuntimeContext
> = {
	description: 'Chunked identity evidence extraction with agentic resolution',
	name: 'story.identities',
	run: async ({ characters, index, premise }, context) => {
		if (characters.length === 0) return characters;
		const nextCharacters = cloneCharacters(characters);
		const routing = buildIdentityExtractionPlans(
			index,
			characters.map((character) => character.name),
			IDENTITY_SELECTION_POLICY,
		);
		await traceRoutingResult(context.trace, routing, index);
		if (routing.entityPlans.length === 0) return nextCharacters;

		const charList = characters
			.map((character) => character.name)
			.join(', ');
		const prefixParts: string[] = [];
		if (premise) prefixParts.push(`Story premise: ${premise}`);
		prefixParts.push(`Known characters: ${charList}`);
		const contextPrefix = prefixParts.join('\n\n');

		const evidenceByPlan = await withConcurrencyLimit(
			routing.entityPlans.map(
				(plan) => async () =>
					runChunkedPass<IdentityEvidence, IdentityEvidence[]>(
						{
							buildPrompt: (chunk, chunkIndex, total) =>
								[
									contextPrefix,
									`Focus only on identity evidence involving ${plan.entityLabel}.`,
									`Story text (section ${chunkIndex + 1} of ${total}):\n${chunk}`,
									'Extract only identity evidence supported by this chunk. Respond with ONLY the JSON object.',
								]
									.filter(Boolean)
									.join('\n\n'),
							chunkInput: {
								chunks: index.chunks,
								maxChars: 3000,
								overlapChars: 300,
							},
							chunkSelector: plan.chunkIndices,
							dedupeBy: (candidate) =>
								`${candidate.characterName.toLowerCase()}::${candidate.linkedCharacterNames.join('|').toLowerCase()}::${candidate.identities.map((identity) => identity.name.toLowerCase()).join('|')}`,
							extractor: identityEvidenceAgent,
							maxConcurrency: 2,
							parseChunk: (result, chunkIndex) =>
								parseIdentityEvidenceChunk(
									result,
									chunkIndex,
								).filter(
									(entry) =>
										entry.characterName.toLowerCase() ===
										plan.entityLabel.toLowerCase(),
								),
							promptScope: 'story.identities.evidence',
							retryCount: 1,
							stage: 'story.identities',
							traceAgent: `identity-evidence:${plan.entityKey}`,
						},
						buildStageContext(context),
					),
			),
			2,
		);
		const narrowedEvidence = evidenceByPlan.flat();
		let resolvedLinks: Array<{
			characterName: string;
			identities: IdentityEvidence['identities'];
			linkedCharacterNames: string[];
		}>;
		try {
			resolvedLinks = await runIdentityResolutionAgent(
				narrowedEvidence,
				context,
			);
		} catch (error) {
			await emitStageWarning(
				context,
				'story.identities',
				`Identity agent failed; using deterministic reducer fallback. ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
			resolvedLinks =
				reduceIdentityEvidenceDeterministically(narrowedEvidence);
		}

		for (const link of resolvedLinks) {
			const character = nextCharacters.find(
				(entry) =>
					entry.name.toLowerCase() ===
					link.characterName.toLowerCase(),
			);
			if (!character) continue;
			character.linkedCharacterNames = mergeUniqueStrings([
				...character.linkedCharacterNames,
				...link.linkedCharacterNames,
			]);
			for (const identity of link.identities) {
				if (
					character.identities.some(
						(existing) =>
							existing.name.toLowerCase() ===
							identity.name.toLowerCase(),
					)
				) {
					continue;
				}
				character.identities.push({
					abilities: identity.abilities,
					appearance: identity.appearance ?? '',
					conditions: identity.conditions ?? '',
					id: randomUUID(),
					knownBy: [],
					name: identity.name,
					notes: identity.notes ?? '',
					selfAware: identity.selfAware,
				});
			}
		}

		return nextCharacters;
	},
};

export const storyStageConfigs = {
	census: storyCensusStage,
	characters: storyCharactersStage,
	core: storyCoreStage,
	identities: storyIdentitiesStage,
	locations: storyLocationsStage,
	memories: storyMemoriesStage,
	relationships: storyRelationshipsStage,
};

export async function runStoryCensusStage(
	args: Parameters<typeof storyCensusStage.run>[0],
	context: StoryStageRuntimeContext,
): Promise<EntityManifest> {
	return storyCensusStage.run(args, context);
}

export async function runStoryCoreStage(
	args: Parameters<typeof storyCoreStage.run>[0],
	context: StoryStageRuntimeContext,
): Promise<NormalisedStoryCore> {
	return storyCoreStage.run(args, context);
}

export async function runStoryLocationsStage(
	args: Parameters<typeof storyLocationsStage.run>[0],
	context: StoryStageRuntimeContext,
): Promise<NormalisedLocation[]> {
	return storyLocationsStage.run(args, context);
}

export async function runStoryCharactersStage(
	args: Parameters<typeof storyCharactersStage.run>[0],
	context: StoryStageRuntimeContext,
): Promise<NormalisedCharacter[]> {
	return storyCharactersStage.run(args, context);
}

export async function runStoryRelationshipsStage(
	args: Parameters<typeof storyRelationshipsStage.run>[0],
	context: StoryStageRuntimeContext,
): Promise<NormalisedCharacter[]> {
	return storyRelationshipsStage.run(args, context);
}

export async function runStoryMemoriesStage(
	args: Parameters<typeof storyMemoriesStage.run>[0],
	context: StoryStageRuntimeContext,
): Promise<NormalisedMemory[]> {
	return storyMemoriesStage.run(args, context);
}

export async function runStoryIdentitiesStage(
	args: Parameters<typeof storyIdentitiesStage.run>[0],
	context: StoryStageRuntimeContext,
): Promise<NormalisedCharacter[]> {
	return storyIdentitiesStage.run(args, context);
}
