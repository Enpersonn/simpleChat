import { createOrchestrator } from '@llm-helpers/agents';
import {
	createSkillRunner,
	defineSkill,
	type SkillRunner,
} from '@llm-helpers/skills';
import {
	createFunctionProvider,
	createToolSystem,
	defineTool,
	type ToolSystem,
} from '@llm-helpers/tools';
import { z } from 'zod';
import { storyLocationsParseAgent } from '../../features/locations/parsing-agent.js';
import { storyMemoriesParseAgent } from '../../features/memories/parsing-agent.js';
import { storyCoreParseAgent } from '../../features/stories/parsing-agent.js';
import {
	type normaliseCharacter,
	normaliseLocation,
	normaliseMemoryItem,
	normaliseStoryCore,
} from '../normalizers.js';
import { createOllamaRuntime } from '../runtime.js';
import { runCharacterDeepDiveAgent } from './agent-character.js';
import { censusAgent } from './census-agent.js';
import { identityAgent } from './identity-agent.js';
import { relationshipAgent } from './relationship-agent.js';
import { runChunked } from './service.js';
import type { ParseVerboseCallback } from './verbose-types.js';

export type NormalisedCharacter = ReturnType<typeof normaliseCharacter>;
export type NormalisedLocation = ReturnType<typeof normaliseLocation>;
export type NormalisedMemory = ReturnType<typeof normaliseMemoryItem>;
export type NormalisedStoryCore = ReturnType<typeof normaliseStoryCore>;

export interface EntityManifest {
	characterNames: string[];
	locationNames: string[];
	sceneNames: string[];
}

// ── Skills ────────────────────────────────────────────────────────────────

const censusSkill = defineSkill({
	description:
		'Enumerate all named characters, locations, and scenes in the story text.',
	async execute({ sanitizedText }, ctx): Promise<EntityManifest> {
		const onVerbose = ctx.metadata?.onVerbose as
			| ParseVerboseCallback
			| undefined;
		try {
			const data = await censusAgent.run(
				`Story text:\n${sanitizedText}`,
				{
					onVerbose: onVerbose
						? (ev) => onVerbose({ agent: 'census', ...ev })
						: undefined,
				},
			);
			return {
				characterNames: Array.isArray(data.characterNames)
					? data.characterNames.filter(
							(n): n is string => typeof n === 'string',
						)
					: [],
				locationNames: Array.isArray(data.locationNames)
					? data.locationNames.filter(
							(n): n is string => typeof n === 'string',
						)
					: [],
				sceneNames: Array.isArray(data.sceneNames)
					? data.sceneNames.filter(
							(n): n is string => typeof n === 'string',
						)
					: [],
			};
		} catch {
			return { characterNames: [], locationNames: [], sceneNames: [] };
		}
	},
	input: z.object({ sanitizedText: z.string() }),
	name: 'story.census',
});

const storeCoreSkill = defineSkill({
	description:
		'Extract title, premise, genres, tone, themes, writing style, and rules.',
	async execute(
		{ sanitizedText, manifest, premise },
		ctx,
	): Promise<NormalisedStoryCore> {
		const onVerbose = ctx.metadata?.onVerbose as
			| ParseVerboseCallback
			| undefined;
		const parts: string[] = [];
		if (premise) parts.push(`Story premise: ${premise}`);
		parts.push(`Story text:\n${sanitizedText}`);
		if (manifest.characterNames.length)
			parts.push(`Characters: ${manifest.characterNames.join(', ')}`);
		parts.push('Respond with ONLY the JSON object. No other text.');
		const data = await storyCoreParseAgent.run(parts.join('\n\n'), {
			onVerbose: onVerbose
				? (ev) => onVerbose({ agent: 'story-core', ...ev })
				: undefined,
		});
		return normaliseStoryCore(data, {
			includePremise: true,
			includeTitle: true,
		});
	},
	input: z.object({
		manifest: z.object({
			characterNames: z.array(z.string()),
			locationNames: z.array(z.string()),
			sceneNames: z.array(z.string()),
		}),
		premise: z.string().optional(),
		sanitizedText: z.string(),
	}),
	name: 'story.core',
});

const locationsSkill = defineSkill({
	description:
		'Extract and deduplicate all named locations from chunked story text.',
	async execute(
		{ chunks, manifest, premise },
		ctx,
	): Promise<NormalisedLocation[]> {
		const onVerbose = ctx.metadata?.onVerbose as
			| ParseVerboseCallback
			| undefined;
		const prefixParts: string[] = [];
		if (premise) prefixParts.push(`Story premise: ${premise}`);
		if (manifest.locationNames.length)
			prefixParts.push(
				`Expected locations: ${manifest.locationNames.join(', ')}`,
			);
		return runChunked(
			storyLocationsParseAgent,
			chunks,
			prefixParts.join('\n\n'),
			'locations',
			normaliseLocation,
			(l) => !!l.name,
			(l) => l.name.toLowerCase(),
			onVerbose ? { agentLabel: 'locations', onVerbose } : undefined,
		);
	},
	input: z.object({
		chunks: z.array(z.string()),
		manifest: z.object({
			characterNames: z.array(z.string()),
			locationNames: z.array(z.string()),
			sceneNames: z.array(z.string()),
		}),
		premise: z.string().optional(),
	}),
	name: 'story.locations',
});

const charactersSkill = defineSkill({
	description:
		'Deep-dive extract of each named character using an agent loop.',
	async execute(
		{ chunks, characterNames, premise },
		ctx,
	): Promise<NormalisedCharacter[]> {
		const onProgress = ctx.metadata?.onProgress as
			| import('./pipeline.js').ParseProgressCallback
			| undefined;
		const onVerbose = ctx.metadata?.onVerbose as
			| ParseVerboseCallback
			| undefined;
		const onCharacterProgress = onProgress
			? (name: string, status: 'start' | 'complete') =>
					onProgress('story.character', status, {
						characterName: name,
					})
			: undefined;
		return runCharacterDeepDiveAgent(
			characterNames,
			chunks,
			premise ? { premise } : undefined,
			onCharacterProgress,
			onVerbose,
		);
	},
	input: z.object({
		characterNames: z.array(z.string()),
		chunks: z.array(z.string()),
		premise: z.string().optional(),
	}),
	name: 'story.characters',
});

const relationshipsSkill = defineSkill({
	description:
		'Merge cross-character relationship edges into the character list.',
	async execute(
		{ sanitizedText, characters },
		ctx,
	): Promise<NormalisedCharacter[]> {
		const onVerbose = ctx.metadata?.onVerbose as
			| ParseVerboseCallback
			| undefined;
		const chars = characters as NormalisedCharacter[];
		if (chars.length === 0) return chars;
		try {
			const charList = chars.map((c) => c.name).join(', ');
			const data = await relationshipAgent.run(
				`Characters: ${charList}\n\nStory text:\n${sanitizedText}`,
				{
					onVerbose: onVerbose
						? (ev) => onVerbose({ agent: 'relationships', ...ev })
						: undefined,
				},
			);
			const rawRels = Array.isArray(data.relationships)
				? data.relationships
				: [];
			for (const rel of rawRels as Record<string, unknown>[]) {
				const fromName =
					typeof rel.fromCharacter === 'string'
						? rel.fromCharacter
						: '';
				const toName =
					typeof rel.toCharacter === 'string' ? rel.toCharacter : '';
				if (!fromName || !toName) continue;
				const char = chars.find(
					(c) => c.name.toLowerCase() === fromName.toLowerCase(),
				);
				if (!char) continue;
				const edge = {
					emotion: typeof rel.emotion === 'string' ? rel.emotion : '',
					otherCharacterName: toName,
					privateAttitude:
						typeof rel.privateAttitude === 'string'
							? rel.privateAttitude
							: '',
					publicAttitude:
						typeof rel.publicAttitude === 'string'
							? rel.publicAttitude
							: '',
					trustLevel:
						typeof rel.trustLevel === 'number'
							? Math.min(10, Math.max(0, rel.trustLevel))
							: 5,
				};
				const existing = char.relationships.find(
					(r) =>
						r.otherCharacterName.toLowerCase() ===
						toName.toLowerCase(),
				);
				if (!existing) char.relationships.push(edge);
			}
		} catch {
			// non-fatal
		}
		return chars;
	},
	input: z.object({
		characters: z.array(z.unknown()),
		sanitizedText: z.string(),
	}),
	name: 'story.relationships',
});

const memoriesSkill = defineSkill({
	description:
		'Extract the chronological timeline of memory events for all characters.',
	async execute(
		{ chunks, characters, manifest, premise },
		ctx,
	): Promise<NormalisedMemory[]> {
		const onVerbose = ctx.metadata?.onVerbose as
			| ParseVerboseCallback
			| undefined;
		const chars = characters as NormalisedCharacter[];
		const charList = chars.map((c) => c.name).join(', ');
		const prefixParts: string[] = [];
		if (premise) prefixParts.push(`Story premise: ${premise}`);
		prefixParts.push(`Known characters: ${charList}`);
		if (manifest.sceneNames.length)
			prefixParts.push(`Known scenes: ${manifest.sceneNames.join(', ')}`);
		return runChunked(
			storyMemoriesParseAgent,
			chunks,
			prefixParts.join('\n\n'),
			'memories',
			normaliseMemoryItem,
			(m) => !!(m.characterName && m.summary),
			undefined,
			onVerbose ? { agentLabel: 'memories', onVerbose } : undefined,
		);
	},
	input: z.object({
		characters: z.array(z.unknown()),
		chunks: z.array(z.string()),
		manifest: z.object({
			characterNames: z.array(z.string()),
			locationNames: z.array(z.string()),
			sceneNames: z.array(z.string()),
		}),
		premise: z.string().optional(),
	}),
	name: 'story.memories',
});

const identitiesSkill = defineSkill({
	description:
		'Resolve cross-character identity links and alternate personas.',
	async execute(
		{ characters, memories },
		ctx,
	): Promise<NormalisedCharacter[]> {
		const onVerbose = ctx.metadata?.onVerbose as
			| ParseVerboseCallback
			| undefined;
		const chars = characters as NormalisedCharacter[];
		const mems = memories as NormalisedMemory[];
		if (chars.length === 0) return chars;
		try {
			const charList = chars.map((c) => c.name).join(', ');
			const timelineSummary = mems
				.slice(0, 20)
				.map((m) => `${m.characterName}: ${m.summary}`)
				.join('\n');
			let data:
				| {
						links?: Array<Record<string, unknown>>;
				  }
				| undefined;

			const resolveIdentitiesTool = defineTool({
				description:
					'Run the identity resolution parser on the provided character and memory summary.',
				execute: async ({ content }) => {
					const result = await identityAgent.run(content, {
						onVerbose: onVerbose
							? (ev) => onVerbose({ agent: 'identities', ...ev })
							: undefined,
					});
					data = result as { links?: Array<Record<string, unknown>> };
					return result;
				},
				input: z.object({
					content: z.string(),
				}),
				name: 'identities.resolve',
			});

			const runtime = await createOllamaRuntime({ numCtx: 8192 });
			const identityTools = createToolSystem({
				providers: [
					createFunctionProvider('identity-tools', [
						resolveIdentitiesTool,
					]),
				],
			});
			const coordinatorTools = createToolSystem({
				providers: [createFunctionProvider('parse-coordinator', [])],
			});
			const orchestrator = createOrchestrator({
				agents: {
					'identity-analyst': {
						options: {
							maxSteps: 3,
						},
						provider: runtime.provider,
						systemPrompt:
							'Call identities.resolve exactly once and use its JSON result as the answer.',
						tools: identityTools,
					},
					'parse-coordinator': {
						options: {
							maxSteps: 3,
						},
						provider: runtime.provider,
						systemPrompt:
							'Delegate the identity resolution task to the identity-analyst agent using the ask skill exactly once. Do not add extra analysis.',
						tools: coordinatorTools,
					},
				},
				router: () => 'parse-coordinator',
			});
			await orchestrator.run(
				`Characters: ${charList}\n\nTimeline summary:\n${timelineSummary}`,
			);
			if (!data) {
				data = await identityAgent.run(
					`Characters: ${charList}\n\nTimeline summary:\n${timelineSummary}`,
					{
						onVerbose: onVerbose
							? (ev) => onVerbose({ agent: 'identities', ...ev })
							: undefined,
					},
				);
			}
			const links = Array.isArray(data.links) ? data.links : [];
			for (const link of links as Record<string, unknown>[]) {
				const charName =
					typeof link.characterName === 'string'
						? link.characterName
						: '';
				if (!charName) continue;
				const char = chars.find(
					(c) => c.name.toLowerCase() === charName.toLowerCase(),
				);
				if (!char) continue;
				if (Array.isArray(link.linkedCharacterNames)) {
					for (const n of link.linkedCharacterNames as unknown[]) {
						if (
							typeof n === 'string' &&
							!char.linkedCharacterNames.includes(n)
						)
							char.linkedCharacterNames.push(n);
					}
				}
				if (Array.isArray(link.identities)) {
					for (const raw of link.identities as Record<
						string,
						unknown
					>[]) {
						if (!raw || typeof raw.name !== 'string' || !raw.name)
							continue;
						const already = char.identities.find(
							(i) =>
								i.name.toLowerCase() ===
								(raw.name as string).toLowerCase(),
						);
						if (!already) {
							char.identities.push({
								abilities: Array.isArray(raw.abilities)
									? (raw.abilities as unknown[]).filter(
											(x): x is string =>
												typeof x === 'string',
										)
									: [],
								appearance:
									typeof raw.appearance === 'string'
										? raw.appearance
										: '',
								conditions:
									typeof raw.conditions === 'string'
										? raw.conditions
										: '',
								id: crypto.randomUUID(),
								knownBy: [],
								name: raw.name as string,
								notes:
									typeof raw.notes === 'string'
										? raw.notes
										: '',
								selfAware: raw.selfAware !== false,
							});
						}
					}
				}
			}
		} catch {
			// non-fatal
		}
		return chars;
	},
	input: z.object({
		characters: z.array(z.unknown()),
		memories: z.array(z.unknown()),
	}),
	name: 'story.identities',
});

// ── Master orchestrator ───────────────────────────────────────────────────

export interface MultiPassResult {
	storyCore: NormalisedStoryCore;
	characters: NormalisedCharacter[];
	locations: NormalisedLocation[];
	memories: NormalisedMemory[];
}

const parseStorySkill = defineSkill({
	description: 'Full multi-pass story parsing pipeline.',
	async execute(
		{ sanitizedText, chunks, premise },
		ctx,
	): Promise<MultiPassResult> {
		const onProgress = ctx.metadata?.onProgress as
			| import('./pipeline.js').ParseProgressCallback
			| undefined;

		// Stage 1: census
		onProgress?.('story.census', 'start', {});
		const manifest = (await ctx.skill('story.census', {
			sanitizedText,
		})) as EntityManifest;
		onProgress?.('story.census', 'complete', {
			characterCount: manifest.characterNames.length,
			locationCount: manifest.locationNames.length,
		});

		// Stages 2 & 3: concurrent — no shared state, both only read manifest
		onProgress?.('story.core+locations', 'start', {});
		const [storyCore, locations] = (await Promise.all([
			ctx.skill('story.core', { manifest, premise, sanitizedText }),
			ctx.skill('story.locations', { chunks, manifest, premise }),
		])) as [NormalisedStoryCore, NormalisedLocation[]];
		onProgress?.('story.core+locations', 'complete', {
			locationCount: locations.length,
			locations,
			storyCore,
		});

		if (manifest.characterNames.length === 0) {
			return { characters: [], locations, memories: [], storyCore };
		}

		// Stage 4: character agent loop
		onProgress?.('story.characters', 'start', {
			count: manifest.characterNames.length,
		});
		const rawCharacters = (await ctx.skill('story.characters', {
			characterNames: manifest.characterNames,
			chunks,
			premise,
		})) as NormalisedCharacter[];
		onProgress?.('story.characters', 'complete', {
			characters: rawCharacters,
			count: rawCharacters.length,
		});

		// Stage 5: relationship merge (mutates in-place, returns same array)
		onProgress?.('story.relationships', 'start', {});
		const characters = (await ctx.skill('story.relationships', {
			characters: rawCharacters,
			sanitizedText,
		})) as NormalisedCharacter[];
		onProgress?.('story.relationships', 'complete', {});

		// Stage 6: memories
		onProgress?.('story.memories', 'start', {});
		const memories = (await ctx.skill('story.memories', {
			characters,
			chunks,
			manifest,
			premise,
		})) as NormalisedMemory[];
		onProgress?.('story.memories', 'complete', {
			count: memories.length,
			memories,
		});

		// Stage 7: identity resolution (mutates characters in-place)
		onProgress?.('story.identities', 'start', {});
		await ctx.skill('story.identities', { characters, memories });
		onProgress?.('story.identities', 'complete', {});

		return { characters, locations, memories, storyCore };
	},
	input: z.object({
		chunks: z.array(z.string()),
		premise: z.string().optional(),
		sanitizedText: z.string(),
	}),
	name: 'story.parse',
	needs: {
		skills: [
			'story.census',
			'story.core',
			'story.locations',
			'story.characters',
			'story.relationships',
			'story.memories',
			'story.identities',
		],
	},
});

// ── Factory ───────────────────────────────────────────────────────────────

export function createParsingSkillRunner(
	opts: {
		tools?: ToolSystem;
		onProgress?: import('./pipeline.js').ParseProgressCallback;
		onVerbose?: ParseVerboseCallback;
	} = {},
): SkillRunner {
	const metadata: Record<string, unknown> = {};
	if (opts.onProgress) metadata.onProgress = opts.onProgress;
	if (opts.onVerbose) metadata.onVerbose = opts.onVerbose;
	return createSkillRunner({
		metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
		skills: [
			censusSkill,
			storeCoreSkill,
			locationsSkill,
			charactersSkill,
			relationshipsSkill,
			memoriesSkill,
			identitiesSkill,
			parseStorySkill,
		],
		tools: opts.tools,
	});
}
