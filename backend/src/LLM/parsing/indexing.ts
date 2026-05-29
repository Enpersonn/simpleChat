import { z } from 'zod';
import { createPromptRunner } from '../prompt-runners/create-prompt-runner.js';
import { type ChunkedPassContext, runChunkedPass } from './chunked-pass.js';
import type { ParseTraceEmitter } from './trace-types.js';

export interface EntityManifest {
	characterNames: string[];
	locationNames: string[];
	sceneNames: string[];
}

export interface ChunkIndexEntry {
	chunkIndex: number;
	eventHints: string[];
	identityHints: string[];
	namedCharacters: string[];
	namedLocations: string[];
	relationshipMentions: Array<{
		fromCharacter: string;
		toCharacter: string;
	}>;
	salienceScore: number;
	sceneMarkers: string[];
	summary: string;
}

export interface ParsingIndex {
	aliases: {
		characters: Record<string, string>;
		locations: Record<string, string>;
		scenes: Record<string, string>;
	};
	characterToChunks: Record<string, number[]>;
	chunks: string[];
	entries: ChunkIndexEntry[];
	identityHintToChunks: Record<string, number[]>;
	locationToChunks: Record<string, number[]>;
	manifest: EntityManifest;
	pairToChunks: Record<string, number[]>;
	rawManifest: EntityManifest;
	sceneToChunks: Record<string, number[]>;
}

export interface StageSelectionPolicy {
	fallbackToSalientChunks?: boolean;
	minimumChunks?: number;
	neighborSpillover?: number;
	selectionLimit?: number;
}

export interface EntityExtractionPlan {
	candidateChunkCount: number;
	fallbackUsed: boolean;
	chunkIndices: number[];
	chunks: string[];
	entityKey: string;
	entityLabel: string;
	preSpilloverSelectedCount: number;
	reason: string;
	spilloverAddedCount: number;
}

export interface ChunkRoutingResult {
	candidateCountAfterSelection: number;
	candidateCountBeforeSelection: number;
	entityPlans: EntityExtractionPlan[];
	selectedChunkIndices: number[];
	stage: string;
}

export interface CoreContextWindow {
	manifest: EntityManifest;
	sceneMarkers: string[];
	selectedChunkIndices: number[];
	summaries: string[];
}

const COMMON_TITLES = new Set([
	'mr',
	'mrs',
	'ms',
	'miss',
	'mx',
	'dr',
	'prof',
	'professor',
	'sir',
	'lady',
	'lord',
	'captain',
	'capt',
	'col',
	'colonel',
	'rev',
	'reverend',
]);

const chunkIndexAgent = createPromptRunner({
	instructions: [
		'Read this chunk of story text and build a lightweight routing index.',
		'namedCharacters: list only named people, creatures, or beings explicitly present in this chunk.',
		'namedLocations: list only named places, rooms, regions, or settings explicitly present in this chunk.',
		'sceneMarkers: list explicit scene or act titles, or short scene labels suggested by a clear transition in this chunk.',
		'identityHints: short evidence phrases for alias, disguise, transformation, hidden identity, body swap, reincarnation, or linked-name clues.',
		'relationshipMentions: only pairs of named characters whose relationship or interaction is explicitly present in this chunk.',
		'eventHints: short phrases for plot-significant events, discoveries, confrontations, departures, reveals, or turning points.',
		'summary: one short sentence, 8-20 words max.',
		'salienceScore: integer 0-10 for how globally important this chunk seems to the story.',
		'Return ONLY the JSON object.',
	].join(' '),
	num_ctx: 4096,
	outputSchema: z.object({
		eventHints: z.array(z.string()).default([]),
		identityHints: z.array(z.string()).default([]),
		namedCharacters: z.array(z.string()).default([]),
		namedLocations: z.array(z.string()).default([]),
		relationshipMentions: z
			.array(
				z.object({
					fromCharacter: z.string(),
					toCharacter: z.string(),
				}),
			)
			.default([]),
		salienceScore: z.number().default(0),
		sceneMarkers: z.array(z.string()).default([]),
		summary: z.string().default(''),
	}),
	role: 'story routing indexer',
	temperature: 0,
});

function cleanValue(value: string): string {
	return value
		.trim()
		.replace(/\s+/g, ' ')
		.replace(/^[,.;:!?()[\]{}'"`]+|[,.;:!?()[\]{}'"`]+$/g, '')
		.trim();
}

function normalizePhrase(value: string): string {
	return cleanValue(value)
		.toLowerCase()
		.replace(/[_*~`]/g, ' ')
		.replace(/[^a-z0-9\s-]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function stripTitles(tokens: string[]): string[] {
	return tokens.filter((token) => !COMMON_TITLES.has(token));
}

function phraseTokens(value: string): string[] {
	return stripTitles(normalizePhrase(value).split(' ').filter(Boolean));
}

function containsWholeToken(tokens: string[], token: string): boolean {
	return tokens.includes(token);
}

function isSubsetOf(smaller: string[], larger: string[]): boolean {
	if (smaller.length === 0) return false;
	return smaller.every((token) => containsWholeToken(larger, token));
}

function sharesAnchorToken(left: string[], right: string[]): boolean {
	if (left.length === 0 || right.length === 0) return false;
	const leftAnchors = new Set([left[0], left[left.length - 1]]);
	return right.some((token) => leftAnchors.has(token));
}

function areLikelyVariants(left: string, right: string): boolean {
	const leftTokens = phraseTokens(left);
	const rightTokens = phraseTokens(right);
	if (leftTokens.length === 0 || rightTokens.length === 0) return false;
	if (leftTokens.join(' ') === rightTokens.join(' ')) return true;
	if (
		(leftTokens.length === 1 || rightTokens.length === 1) &&
		(sharesAnchorToken(leftTokens, rightTokens) ||
			isSubsetOf(leftTokens, rightTokens) ||
			isSubsetOf(rightTokens, leftTokens))
	) {
		return true;
	}
	if (
		sharesAnchorToken(leftTokens, rightTokens) &&
		(isSubsetOf(leftTokens, rightTokens) ||
			isSubsetOf(rightTokens, leftTokens))
	) {
		return true;
	}
	return false;
}

function chooseCanonicalValue(values: string[]): string {
	return [...values].sort((left, right) => {
		const leftTokens = phraseTokens(left).length;
		const rightTokens = phraseTokens(right).length;
		if (rightTokens !== leftTokens) return rightTokens - leftTokens;
		if (right.length !== left.length) return right.length - left.length;
		return left.localeCompare(right);
	})[0];
}

function consolidateValues(values: string[]): {
	aliases: Record<string, string>;
	values: string[];
} {
	const cleaned = mergeUniqueStrings(values);
	const groups: Array<{
		canonical: string;
		members: string[];
	}> = [];

	for (const value of cleaned) {
		const target = groups.find((group) =>
			group.members.some((member) => areLikelyVariants(member, value)),
		);
		if (!target) {
			groups.push({ canonical: value, members: [value] });
			continue;
		}
		target.members.push(value);
		target.canonical = chooseCanonicalValue(target.members);
	}

	const aliases: Record<string, string> = {};
	for (const group of groups) {
		for (const member of group.members) {
			aliases[normalizePhrase(member)] = group.canonical;
		}
	}

	return {
		aliases,
		values: groups
			.map((group) => group.canonical)
			.sort((left, right) => left.localeCompare(right)),
	};
}

function canonicalizeValue(
	value: string,
	aliases: Record<string, string>,
): string {
	const cleaned = cleanValue(value);
	if (!cleaned) return '';
	return aliases[normalizePhrase(cleaned)] ?? cleaned;
}

function mergeUniqueStrings(values: string[]): string[] {
	const seen = new Set<string>();
	const merged: string[] = [];
	for (const value of values) {
		const cleaned = cleanValue(value);
		const key = normalizePhrase(cleaned);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		merged.push(cleaned);
	}
	return merged;
}

function clampSalience(value: unknown): number {
	if (typeof value !== 'number' || Number.isNaN(value)) return 0;
	return Math.max(0, Math.min(10, Math.round(value)));
}

function indexKey(value: string): string {
	return normalizePhrase(value);
}

function pairKey(left: string, right: string): string {
	return [left, right]
		.map((value) => cleanValue(value))
		.filter(Boolean)
		.sort((a, b) => a.localeCompare(b))
		.join('::');
}

function addIndexValue(
	record: Record<string, number[]>,
	key: string,
	chunkIndex: number,
) {
	if (!key) return;
	const existing = record[key] ?? [];
	if (!existing.includes(chunkIndex)) {
		existing.push(chunkIndex);
		existing.sort((left, right) => left - right);
	}
	record[key] = existing;
}

function sortChunkIndicesBySalience(
	entries: ChunkIndexEntry[],
	chunkIndices: number[],
): number[] {
	return [...new Set(chunkIndices)].sort((left, right) => {
		const rightScore = entries[right]?.salienceScore ?? 0;
		const leftScore = entries[left]?.salienceScore ?? 0;
		if (rightScore !== leftScore) return rightScore - leftScore;
		return left - right;
	});
}

function expandChunkIndices(
	chunkIndices: number[],
	totalChunks: number,
	neighborSpillover = 0,
): number[] {
	if (neighborSpillover <= 0) {
		return [...new Set(chunkIndices)].sort((left, right) => left - right);
	}
	const expanded = new Set<number>();
	for (const chunkIndex of chunkIndices) {
		for (
			let cursor = chunkIndex - neighborSpillover;
			cursor <= chunkIndex + neighborSpillover;
			cursor += 1
		) {
			if (cursor < 0 || cursor >= totalChunks) continue;
			expanded.add(cursor);
		}
	}
	return [...expanded].sort((left, right) => left - right);
}

function applySelectionPolicy(
	entries: ChunkIndexEntry[],
	candidateChunkIndices: number[],
	totalChunks: number,
	policy: StageSelectionPolicy,
): {
	chunkIndices: number[];
	fallbackUsed: boolean;
	preSpilloverSelectedCount: number;
	spilloverAddedCount: number;
} {
	const minimumChunks = Math.max(0, policy.minimumChunks ?? 0);
	const selectionLimit = Math.max(
		minimumChunks,
		policy.selectionLimit ?? candidateChunkIndices.length,
	);
	const sorted = sortChunkIndicesBySalience(entries, candidateChunkIndices);
	const limited = sorted.slice(0, selectionLimit);
	let fallbackUsed = false;
	if (
		limited.length < minimumChunks &&
		policy.fallbackToSalientChunks !== false
	) {
		const fallback = sortChunkIndicesBySalience(
			entries,
			entries.map((entry) => entry.chunkIndex),
		).slice(0, minimumChunks);
		limited.push(...fallback);
		fallbackUsed = fallback.length > 0;
	}
	const preSpilloverChunkIndices = [...new Set(limited)].sort(
		(left, right) => left - right,
	);
	const chunkIndices = expandChunkIndices(
		limited,
		totalChunks,
		policy.neighborSpillover ?? 0,
	);
	return {
		chunkIndices,
		fallbackUsed,
		preSpilloverSelectedCount: preSpilloverChunkIndices.length,
		spilloverAddedCount: Math.max(
			0,
			chunkIndices.length - preSpilloverChunkIndices.length,
		),
	};
}

function toEntityPlan(
	entityKey: string,
	entityLabel: string,
	selection: ReturnType<typeof applySelectionPolicy>,
	candidateChunkCount: number,
	index: ParsingIndex,
	reason: string,
): EntityExtractionPlan {
	return {
		candidateChunkCount,
		chunkIndices: selection.chunkIndices,
		chunks: selection.chunkIndices.map(
			(chunkIndex) => index.chunks[chunkIndex],
		),
		entityKey,
		entityLabel,
		fallbackUsed: selection.fallbackUsed,
		preSpilloverSelectedCount: selection.preSpilloverSelectedCount,
		reason,
		spilloverAddedCount: selection.spilloverAddedCount,
	};
}

async function emitIndexTrace(
	trace: ParseTraceEmitter | undefined,
	kind: 'index_start' | 'index_complete' | 'index_error',
	payload: Record<string, unknown>,
) {
	await trace?.emit({
		kind,
		payload,
		stage: 'story.index',
	});
}

export function isParsingIndex(value: unknown): value is ParsingIndex {
	return (
		typeof value === 'object' &&
		value !== null &&
		'entries' in value &&
		'chunks' in value &&
		'manifest' in value
	);
}

function buildManifest(entries: ChunkIndexEntry[]): {
	aliases: ParsingIndex['aliases'];
	manifest: EntityManifest;
	rawManifest: EntityManifest;
} {
	const rawManifest: EntityManifest = {
		characterNames: mergeUniqueStrings(
			entries.flatMap((entry) => entry.namedCharacters),
		),
		locationNames: mergeUniqueStrings(
			entries.flatMap((entry) => entry.namedLocations),
		),
		sceneNames: mergeUniqueStrings(
			entries.flatMap((entry) => entry.sceneMarkers),
		),
	};
	const characters = consolidateValues(rawManifest.characterNames);
	const locations = consolidateValues(rawManifest.locationNames);
	const scenes = consolidateValues(rawManifest.sceneNames);

	return {
		aliases: {
			characters: characters.aliases,
			locations: locations.aliases,
			scenes: scenes.aliases,
		},
		manifest: {
			characterNames: characters.values,
			locationNames: locations.values,
			sceneNames: scenes.values,
		},
		rawManifest,
	};
}

function canonicalizeEntries(
	entries: ChunkIndexEntry[],
	aliases: ParsingIndex['aliases'],
): ChunkIndexEntry[] {
	return entries.map((entry) => ({
		...entry,
		namedCharacters: mergeUniqueStrings(
			entry.namedCharacters.map((value) =>
				canonicalizeValue(value, aliases.characters),
			),
		),
		namedLocations: mergeUniqueStrings(
			entry.namedLocations.map((value) =>
				canonicalizeValue(value, aliases.locations),
			),
		),
		relationshipMentions: entry.relationshipMentions
			.map((pair) => ({
				fromCharacter: canonicalizeValue(
					pair.fromCharacter,
					aliases.characters,
				),
				toCharacter: canonicalizeValue(
					pair.toCharacter,
					aliases.characters,
				),
			}))
			.filter(
				(pair) =>
					!!pair.fromCharacter &&
					!!pair.toCharacter &&
					pair.fromCharacter.toLowerCase() !==
						pair.toCharacter.toLowerCase(),
			),
		sceneMarkers: mergeUniqueStrings(
			entry.sceneMarkers.map((value) =>
				canonicalizeValue(value, aliases.scenes),
			),
		),
	}));
}

function buildLookupMaps(
	entries: ChunkIndexEntry[],
	chunks: string[],
	manifest: EntityManifest,
	aliases: ParsingIndex['aliases'],
	rawManifest: EntityManifest,
): ParsingIndex {
	const characterToChunks: Record<string, number[]> = {};
	const locationToChunks: Record<string, number[]> = {};
	const sceneToChunks: Record<string, number[]> = {};
	const pairToChunks: Record<string, number[]> = {};
	const identityHintToChunks: Record<string, number[]> = {};

	for (const entry of entries) {
		for (const characterName of entry.namedCharacters) {
			addIndexValue(
				characterToChunks,
				indexKey(characterName),
				entry.chunkIndex,
			);
		}

		for (const locationName of entry.namedLocations) {
			addIndexValue(
				locationToChunks,
				indexKey(locationName),
				entry.chunkIndex,
			);
		}

		for (const sceneName of entry.sceneMarkers) {
			addIndexValue(sceneToChunks, indexKey(sceneName), entry.chunkIndex);
		}

		for (const hint of entry.identityHints) {
			addIndexValue(
				identityHintToChunks,
				indexKey(hint),
				entry.chunkIndex,
			);
		}

		const uniqueCharacters = mergeUniqueStrings(entry.namedCharacters);
		for (let index = 0; index < uniqueCharacters.length; index += 1) {
			for (
				let cursor = index + 1;
				cursor < uniqueCharacters.length;
				cursor += 1
			) {
				addIndexValue(
					pairToChunks,
					pairKey(uniqueCharacters[index], uniqueCharacters[cursor]),
					entry.chunkIndex,
				);
			}
		}

		for (const pair of entry.relationshipMentions) {
			addIndexValue(
				pairToChunks,
				pairKey(pair.fromCharacter, pair.toCharacter),
				entry.chunkIndex,
			);
		}
	}

	return {
		aliases,
		characterToChunks,
		chunks,
		entries,
		identityHintToChunks,
		locationToChunks,
		manifest,
		pairToChunks,
		rawManifest,
		sceneToChunks,
	};
}

export async function buildParsingIndex(
	{
		chunks,
		sanitizedText,
	}: {
		chunks: string[];
		sanitizedText: string;
	},
	context: ChunkedPassContext,
): Promise<ParsingIndex> {
	const chunkInput = chunks.length > 0 ? chunks : [sanitizedText];
	await emitIndexTrace(context.trace, 'index_start', {
		chunkCount: chunkInput.length,
	});

	try {
		const rawEntries = await runChunkedPass<
			ChunkIndexEntry,
			ChunkIndexEntry[]
		>(
			{
				buildPrompt: (chunk, chunkIndex, total) =>
					[
						`Story text (section ${chunkIndex + 1} of ${total}):\n${chunk}`,
						'Build a lightweight routing index for this chunk. Return ONLY the JSON object.',
					].join('\n\n'),
				chunkInput: {
					chunks: chunkInput,
					maxChars: 3000,
					overlapChars: 300,
				},
				extractor: chunkIndexAgent,
				maxConcurrency: 3,
				parseChunk: (result, chunkIndex) => [
					{
						chunkIndex,
						eventHints: Array.isArray(result.eventHints)
							? (result.eventHints as unknown[]).filter(
									(value): value is string =>
										typeof value === 'string',
								)
							: [],
						identityHints: Array.isArray(result.identityHints)
							? (result.identityHints as unknown[]).filter(
									(value): value is string =>
										typeof value === 'string',
								)
							: [],
						namedCharacters: Array.isArray(result.namedCharacters)
							? (result.namedCharacters as unknown[]).filter(
									(value): value is string =>
										typeof value === 'string',
								)
							: [],
						namedLocations: Array.isArray(result.namedLocations)
							? (result.namedLocations as unknown[]).filter(
									(value): value is string =>
										typeof value === 'string',
								)
							: [],
						relationshipMentions: Array.isArray(
							result.relationshipMentions,
						)
							? (
									result.relationshipMentions as unknown[]
								).flatMap((value) => {
									if (
										typeof value !== 'object' ||
										value === null
									) {
										return [];
									}
									const pair = value as Record<
										string,
										unknown
									>;
									const fromCharacter =
										typeof pair.fromCharacter === 'string'
											? pair.fromCharacter
											: '';
									const toCharacter =
										typeof pair.toCharacter === 'string'
											? pair.toCharacter
											: '';
									return fromCharacter && toCharacter
										? [{ fromCharacter, toCharacter }]
										: [];
								})
							: [],
						salienceScore: clampSalience(result.salienceScore),
						sceneMarkers: Array.isArray(result.sceneMarkers)
							? (result.sceneMarkers as unknown[]).filter(
									(value): value is string =>
										typeof value === 'string',
								)
							: [],
						summary:
							typeof result.summary === 'string'
								? cleanValue(result.summary)
								: '',
					},
				],
				promptScope: 'story.index',
				retryCount: 1,
				stage: 'story.index',
				traceAgent: 'chunk-index',
			},
			context,
		);

		const { aliases, manifest, rawManifest } = buildManifest(rawEntries);
		const canonicalEntries = canonicalizeEntries(rawEntries, aliases);
		const index = buildLookupMaps(
			canonicalEntries,
			chunkInput,
			manifest,
			aliases,
			rawManifest,
		);

		await emitIndexTrace(context.trace, 'index_complete', {
			candidateCountAfterConsolidation:
				manifest.characterNames.length +
				manifest.locationNames.length +
				manifest.sceneNames.length,
			candidateCountBeforeConsolidation:
				rawManifest.characterNames.length +
				rawManifest.locationNames.length +
				rawManifest.sceneNames.length,
			characterCount: manifest.characterNames.length,
			chunkCount: chunkInput.length,
			locationCount: manifest.locationNames.length,
			sceneCount: manifest.sceneNames.length,
		});

		return index;
	} catch (error) {
		await emitIndexTrace(context.trace, 'index_error', {
			chunkCount: chunkInput.length,
			message: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}

export function buildCoreContextWindow(
	index: ParsingIndex,
	policy: StageSelectionPolicy = {
		fallbackToSalientChunks: true,
		minimumChunks: 4,
		selectionLimit: 6,
	},
): CoreContextWindow {
	const sceneChunkIndices = index.entries
		.filter((entry) => entry.sceneMarkers.length > 0)
		.map((entry) => entry.chunkIndex);
	const summaryChunkIndices = index.entries
		.filter((entry) => !!entry.summary)
		.map((entry) => entry.chunkIndex);
	const salientChunkIndices = index.entries
		.filter((entry) => entry.salienceScore >= 6)
		.map((entry) => entry.chunkIndex);

	const selectedChunkIndices = applySelectionPolicy(
		index.entries,
		[
			...sceneChunkIndices,
			...summaryChunkIndices,
			...salientChunkIndices,
			...index.entries.map((entry) => entry.chunkIndex),
		],
		index.chunks.length,
		policy,
	).chunkIndices;
	const selectedEntries = selectedChunkIndices.map(
		(chunkIndex) => index.entries[chunkIndex],
	);

	return {
		manifest: index.manifest,
		sceneMarkers: mergeUniqueStrings(
			selectedEntries.flatMap((entry) => entry.sceneMarkers),
		),
		selectedChunkIndices,
		summaries: selectedEntries
			.map((entry) => entry.summary)
			.filter(Boolean)
			.slice(0, policy.selectionLimit ?? selectedEntries.length),
	};
}

export function buildCharacterExtractionPlans(
	index: ParsingIndex,
	characterNames: string[],
	policy: StageSelectionPolicy = {
		fallbackToSalientChunks: true,
		minimumChunks: 2,
		neighborSpillover: 1,
		selectionLimit: 4,
	},
): ChunkRoutingResult {
	const entityPlans = characterNames.map((characterName) => {
		const canonicalName = canonicalizeValue(
			characterName,
			index.aliases.characters,
		);
		const candidateChunkIndices =
			index.characterToChunks[indexKey(canonicalName)] ?? [];
		const selection = applySelectionPolicy(
			index.entries,
			candidateChunkIndices,
			index.chunks.length,
			policy,
		);
		return toEntityPlan(
			indexKey(canonicalName),
			canonicalName,
			selection,
			candidateChunkIndices.length,
			index,
			candidateChunkIndices.length > 0
				? 'character_mentions'
				: 'salience_fallback',
		);
	});

	return {
		candidateCountAfterSelection: entityPlans.reduce(
			(sum, plan) => sum + plan.chunkIndices.length,
			0,
		),
		candidateCountBeforeSelection: entityPlans.reduce((sum, plan) => {
			const direct = index.characterToChunks[plan.entityKey]?.length ?? 0;
			return sum + direct;
		}, 0),
		entityPlans,
		selectedChunkIndices: mergeUniqueNumbers(
			entityPlans.flatMap((plan) => plan.chunkIndices),
		),
		stage: 'story.characters',
	};
}

export function buildLocationChunkSelection(
	index: ParsingIndex,
	policy: StageSelectionPolicy = {
		fallbackToSalientChunks: true,
		minimumChunks: 4,
		neighborSpillover: 1,
		selectionLimit: 8,
	},
): ChunkRoutingResult {
	const candidateChunkIndices = mergeUniqueNumbers(
		Object.values(index.locationToChunks).flat(),
	);
	const selectedChunkIndices = applySelectionPolicy(
		index.entries,
		candidateChunkIndices,
		index.chunks.length,
		policy,
	).chunkIndices;

	return {
		candidateCountAfterSelection: selectedChunkIndices.length,
		candidateCountBeforeSelection: candidateChunkIndices.length,
		entityPlans: [
			toEntityPlan(
				'locations',
				'locations',
				{
					chunkIndices: selectedChunkIndices,
					fallbackUsed: false,
					preSpilloverSelectedCount: selectedChunkIndices.length,
					spilloverAddedCount: 0,
				},
				candidateChunkIndices.length,
				index,
				'location_mentions',
			),
		],
		selectedChunkIndices,
		stage: 'story.locations',
	};
}

export function buildRelationshipExtractionPlans(
	index: ParsingIndex,
	characterNames: string[],
	policy: StageSelectionPolicy = {
		fallbackToSalientChunks: false,
		minimumChunks: 1,
		selectionLimit: 4,
	},
): ChunkRoutingResult {
	const allowedNames = new Set(
		characterNames.map((name) =>
			indexKey(canonicalizeValue(name, index.aliases.characters)),
		),
	);
	const entityPlans = Object.entries(index.pairToChunks)
		.filter(([key]) => {
			const [left, right] = key.split('::');
			return (
				allowedNames.has(indexKey(left)) &&
				allowedNames.has(indexKey(right))
			);
		})
		.map(([key, candidateChunkIndices]) => {
			const [left, right] = key.split('::');
			const selection = applySelectionPolicy(
				index.entries,
				candidateChunkIndices,
				index.chunks.length,
				policy,
			);
			return toEntityPlan(
				key,
				`${left} <-> ${right}`,
				selection,
				candidateChunkIndices.length,
				index,
				'pair_cooccurrence',
			);
		})
		.filter((plan) => plan.chunkIndices.length > 0);

	return {
		candidateCountAfterSelection: entityPlans.reduce(
			(sum, plan) => sum + plan.chunkIndices.length,
			0,
		),
		candidateCountBeforeSelection: entityPlans.reduce((sum, plan) => {
			const direct = index.pairToChunks[plan.entityKey]?.length ?? 0;
			return sum + direct;
		}, 0),
		entityPlans,
		selectedChunkIndices: mergeUniqueNumbers(
			entityPlans.flatMap((plan) => plan.chunkIndices),
		),
		stage: 'story.relationships',
	};
}

export function buildMemoryExtractionPlans(
	index: ParsingIndex,
	characterNames: string[],
	policy: StageSelectionPolicy = {
		fallbackToSalientChunks: true,
		minimumChunks: 2,
		neighborSpillover: 1,
		selectionLimit: 5,
	},
): ChunkRoutingResult {
	const entityPlans = characterNames.map((characterName) => {
		const canonicalName = canonicalizeValue(
			characterName,
			index.aliases.characters,
		);
		const directChunkIndices =
			index.characterToChunks[indexKey(canonicalName)] ?? [];
		const relatedScenes = mergeUniqueStrings(
			directChunkIndices.flatMap(
				(chunkIndex) => index.entries[chunkIndex]?.sceneMarkers ?? [],
			),
		);
		const eventChunkIndices = mergeUniqueNumbers(
			relatedScenes.flatMap(
				(sceneName) =>
					index.sceneToChunks[indexKey(sceneName)]?.filter(
						(chunkIndex) =>
							(index.entries[chunkIndex]?.eventHints.length ??
								0) > 0,
					) ?? [],
			),
		);
		const candidateChunkIndices = [
			...directChunkIndices,
			...eventChunkIndices,
		];
		const selection = applySelectionPolicy(
			index.entries,
			candidateChunkIndices,
			index.chunks.length,
			policy,
		);
		return toEntityPlan(
			indexKey(canonicalName),
			canonicalName,
			selection,
			candidateChunkIndices.length,
			index,
			eventChunkIndices.length > 0
				? 'character_and_scene_events'
				: 'character_mentions',
		);
	});

	return {
		candidateCountAfterSelection: entityPlans.reduce(
			(sum, plan) => sum + plan.chunkIndices.length,
			0,
		),
		candidateCountBeforeSelection: entityPlans.reduce((sum, plan) => {
			const direct = index.characterToChunks[plan.entityKey]?.length ?? 0;
			return sum + direct;
		}, 0),
		entityPlans,
		selectedChunkIndices: mergeUniqueNumbers(
			entityPlans.flatMap((plan) => plan.chunkIndices),
		),
		stage: 'story.memories',
	};
}

export function buildIdentityExtractionPlans(
	index: ParsingIndex,
	characterNames: string[],
	policy: StageSelectionPolicy = {
		fallbackToSalientChunks: false,
		minimumChunks: 1,
		selectionLimit: 4,
	},
): ChunkRoutingResult {
	const hintChunkIndices = mergeUniqueNumbers(
		index.entries
			.filter((entry) => entry.identityHints.length > 0)
			.map((entry) => entry.chunkIndex),
	);
	const entityPlans = characterNames.map((characterName) => {
		const canonicalName = canonicalizeValue(
			characterName,
			index.aliases.characters,
		);
		const directChunkIndices = (
			index.characterToChunks[indexKey(canonicalName)] ?? []
		).filter(
			(chunkIndex) =>
				hintChunkIndices.includes(chunkIndex) ||
				(index.entries[chunkIndex]?.namedCharacters.length ?? 0) > 1,
		);
		const selection = applySelectionPolicy(
			index.entries,
			directChunkIndices,
			index.chunks.length,
			policy,
		);
		return toEntityPlan(
			indexKey(canonicalName),
			canonicalName,
			selection,
			directChunkIndices.length,
			index,
			identityHitsReason(selection.chunkIndices, hintChunkIndices),
		);
	});

	return {
		candidateCountAfterSelection: entityPlans.reduce(
			(sum, plan) => sum + plan.chunkIndices.length,
			0,
		),
		candidateCountBeforeSelection: entityPlans.reduce((sum, plan) => {
			const direct = index.characterToChunks[plan.entityKey]?.length ?? 0;
			return sum + direct;
		}, 0),
		entityPlans: entityPlans.filter((plan) => plan.chunkIndices.length > 0),
		selectedChunkIndices: mergeUniqueNumbers(
			entityPlans.flatMap((plan) => plan.chunkIndices),
		),
		stage: 'story.identities',
	};
}

function identityHitsReason(
	chunkIndices: number[],
	hintChunkIndices: number[],
): string {
	return chunkIndices.some((chunkIndex) =>
		hintChunkIndices.includes(chunkIndex),
	)
		? 'identity_hints'
		: 'linked_name_mentions';
}

function mergeUniqueNumbers(values: number[]): number[] {
	return [...new Set(values)].sort((left, right) => left - right);
}
