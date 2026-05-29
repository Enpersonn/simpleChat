import type { ParsingIndex } from '../indexing.js';
import { chunkText, sanitizeTextForParsing } from '../sanitize.js';
import type {
	NormalisedCharacter,
	NormalisedLocation,
	NormalisedMemory,
	NormalisedStoryCore,
} from '../stages.js';
import type {
	BenchmarkGold,
	BenchmarkLoadedStory,
	BenchmarkMetricRegistryOutput,
	BenchmarkMetricRow,
	BenchmarkRepeatResult,
	BenchmarkSummarySnapshot,
} from './types.js';
import {
	average,
	median,
	namesComparable,
	normalizeName,
	normalizeWhitespace,
	standardDeviation,
	toTimestampMs,
	uniqueStrings,
} from './utils.js';

type NameScore = {
	extras: string[];
	f1: number | null;
	hits: Array<{ expected: string; found: string }>;
	missing: string[];
	precision: number | null;
	recall: number | null;
};

function countRelationships(characters: NormalisedCharacter[]): number {
	return characters.reduce(
		(sum, character) => sum + character.relationships.length,
		0,
	);
}

function countIdentities(characters: NormalisedCharacter[]): number {
	return characters.reduce(
		(sum, character) => sum + character.identities.length,
		0,
	);
}

function summarizeStoryCore(storyCore: NormalisedStoryCore) {
	return {
		genreCount: storyCore.genres.length,
		hasPremise: (storyCore.premise ?? '').trim().length > 0,
		hasTitle: (storyCore.title ?? '').trim().length > 0,
		ruleCount:
			storyCore.rules.characterRules.length +
			storyCore.rules.storyRules.length +
			storyCore.rules.worldRules.length,
		themeCount: storyCore.themes.length,
		toneCount: storyCore.tone.length,
		writingStyleFieldsFilled: [
			storyCore.writingStyle.dialogue,
			storyCore.writingStyle.interiority,
			storyCore.writingStyle.pacing,
			storyCore.writingStyle.prose,
			storyCore.writingStyle.sensory,
		].filter((value) => value.trim().length > 0).length,
	};
}

function summarizeCharacters(characters: NormalisedCharacter[]) {
	const fieldFillScores = characters.map((character) => {
		const fields = [
			character.appearance,
			character.role,
			character.speechStyle,
			character.trueMotives,
		];
		return (
			fields.filter((value) => value.trim().length > 0).length /
			fields.length
		);
	});
	return {
		averageFears: Number(
			average(
				characters.map((character) => character.fears.length),
			).toFixed(2),
		),
		averageFieldFillRate: Number(average(fieldFillScores).toFixed(3)),
		averagePersonalityTraits: Number(
			average(
				characters.map((character) => character.personality.length),
			).toFixed(2),
		),
		characterCount: characters.length,
		identityCount: countIdentities(characters),
		linkedCharacterCount: characters.reduce(
			(sum, character) => sum + character.linkedCharacterNames.length,
			0,
		),
		relationshipCount: countRelationships(characters),
	};
}

function findDuplicateLocations(locations: NormalisedLocation[]) {
	const warnings: string[] = [];
	for (let index = 0; index < locations.length; index += 1) {
		for (let cursor = index + 1; cursor < locations.length; cursor += 1) {
			const left = locations[index].name.toLowerCase();
			const right = locations[cursor].name.toLowerCase();
			if (!left || !right) continue;
			if (left.includes(right) || right.includes(left)) {
				warnings.push(
					`${locations[index].name} <-> ${locations[cursor].name}`,
				);
			}
		}
	}
	return warnings;
}

function summarizeLocations(locations: NormalisedLocation[]) {
	const duplicateWarnings = findDuplicateLocations(locations);
	return {
		averageConnections: Number(
			average(
				locations.map(
					(location) => location.connectedLocationNames.length,
				),
			).toFixed(2),
		),
		averageTags: Number(
			average(locations.map((location) => location.tags.length)).toFixed(
				2,
			),
		),
		duplicateWarningCount: duplicateWarnings.length,
		duplicateWarnings,
		locationCount: locations.length,
		locationsWithParents: locations.filter(
			(location) => !!location.parentLocationName,
		).length,
	};
}

function summarizeMemories(memories: NormalisedMemory[]) {
	const withDeltas = memories.filter(
		(memory) => memory.deltas.effects.length > 0,
	).length;
	return {
		averageImportance: Number(
			average(memories.map((memory) => memory.importance)).toFixed(3),
		),
		highImportanceCount: memories.filter(
			(memory) => memory.importance >= 0.8,
		).length,
		memoriesWithDeltas: withDeltas,
		memoriesWithDeltasRate:
			memories.length > 0
				? Number((withDeltas / memories.length).toFixed(3))
				: 0,
		memoryCount: memories.length,
	};
}

function summarizeIndex(index: ParsingIndex) {
	return {
		aliasCharacterCollisions:
			index.rawManifest.characterNames.length -
			index.manifest.characterNames.length,
		aliasLocationCollisions:
			index.rawManifest.locationNames.length -
			index.manifest.locationNames.length,
		aliasSceneCollisions:
			index.rawManifest.sceneNames.length -
			index.manifest.sceneNames.length,
		averageCharactersPerChunk: Number(
			average(
				index.entries.map((entry) => entry.namedCharacters.length),
			).toFixed(2),
		),
		averageLocationsPerChunk: Number(
			average(
				index.entries.map((entry) => entry.namedLocations.length),
			).toFixed(2),
		),
		averageSalience: Number(
			average(index.entries.map((entry) => entry.salienceScore)).toFixed(
				2,
			),
		),
		characterCount: index.manifest.characterNames.length,
		chunkCount: index.chunks.length,
		identityHintChunkCount: index.entries.filter(
			(entry) => entry.identityHints.length > 0,
		).length,
		locationCount: index.manifest.locationNames.length,
		pairMapSize: Object.keys(index.pairToChunks).length,
		rawCharacterCount: index.rawManifest.characterNames.length,
		rawLocationCount: index.rawManifest.locationNames.length,
		rawSceneCount: index.rawManifest.sceneNames.length,
		salienceDistribution: {
			high: index.entries.filter((entry) => entry.salienceScore >= 7)
				.length,
			low: index.entries.filter((entry) => entry.salienceScore <= 3)
				.length,
			medium: index.entries.filter(
				(entry) => entry.salienceScore > 3 && entry.salienceScore < 7,
			).length,
		},
		sceneCount: index.manifest.sceneNames.length,
	};
}

function scoreNames(found: string[], expected: string[]): NameScore {
	const unmatchedFound = [...found];
	const hits: Array<{ expected: string; found: string }> = [];
	const missing: string[] = [];

	for (const wanted of expected) {
		const matchIndex = unmatchedFound.findIndex((candidate) =>
			namesComparable(candidate, wanted),
		);
		if (matchIndex === -1) {
			missing.push(wanted);
			continue;
		}
		hits.push({
			expected: wanted,
			found: unmatchedFound[matchIndex],
		});
		unmatchedFound.splice(matchIndex, 1);
	}

	const precision = found.length > 0 ? hits.length / found.length : 1;
	const recall = expected.length > 0 ? hits.length / expected.length : null;
	const f1 =
		recall !== null && precision + recall > 0
			? (2 * precision * recall) / (precision + recall)
			: null;

	return {
		extras: unmatchedFound,
		f1: f1 === null ? null : Number(f1.toFixed(3)),
		hits,
		missing,
		precision: expected.length > 0 ? Number(precision.toFixed(3)) : null,
		recall: recall === null ? null : Number(recall.toFixed(3)),
	};
}

function buildIdentityPairs(characters: NormalisedCharacter[]) {
	const pairs = new Set<string>();
	for (const character of characters) {
		for (const linked of character.linkedCharacterNames) {
			const normalized = [character.name, linked]
				.map((value) => normalizeName(value))
				.filter(Boolean)
				.sort((left, right) => left.localeCompare(right))
				.join('::');
			if (normalized) pairs.add(normalized);
		}
	}
	return [...pairs];
}

function scoreIdentityLinks(
	characters: NormalisedCharacter[],
	gold: BenchmarkGold,
) {
	const foundPairs = buildIdentityPairs(characters);
	const expectedPairs = gold.identityLinks.map(({ left, right }) =>
		[normalizeName(left), normalizeName(right)]
			.sort((a, b) => a.localeCompare(b))
			.join('::'),
	);
	const hits = expectedPairs.filter((pair) => foundPairs.includes(pair));
	const recall =
		expectedPairs.length > 0 ? hits.length / expectedPairs.length : null;
	const precision =
		foundPairs.length > 0 ? hits.length / foundPairs.length : null;
	const f1 =
		recall !== null && precision !== null && recall + precision > 0
			? (2 * recall * precision) / (recall + precision)
			: null;
	return {
		expectedCount: expectedPairs.length,
		f1: f1 === null ? null : Number(f1.toFixed(3)),
		foundCount: foundPairs.length,
		hits,
		precision: precision === null ? null : Number(precision.toFixed(3)),
		recall: recall === null ? null : Number(recall.toFixed(3)),
	};
}

function scoreKeyMemories(memories: NormalisedMemory[], gold: BenchmarkGold) {
	const matches = gold.keyMemories.map((entry) => {
		const matched = memories.find((memory) => {
			if (!namesComparable(memory.characterName, entry.characterName))
				return false;
			if (
				typeof entry.importanceMin === 'number' &&
				memory.importance < entry.importanceMin
			) {
				return false;
			}
			if (
				entry.sceneId &&
				normalizeName(memory.sceneId ?? '') !==
					normalizeName(entry.sceneId)
			) {
				return false;
			}
			const normalizedSummary = normalizeName(memory.summary);
			return entry.summaryIncludesAny.some((phrase) =>
				normalizedSummary.includes(normalizeName(phrase)),
			);
		});
		return {
			characterName: entry.characterName,
			id: entry.id,
			matched: !!matched,
			summary: matched?.summary ?? null,
		};
	});

	const hitCount = matches.filter((match) => match.matched).length;
	return {
		coverage:
			gold.keyMemories.length > 0
				? Number((hitCount / gold.keyMemories.length).toFixed(3))
				: null,
		expectedCount: gold.keyMemories.length,
		hitCount,
		matches,
	};
}

function scoreStoryCoreAnchors(
	storyCore: NormalisedStoryCore,
	gold: BenchmarkGold,
) {
	const normalizedTitle = normalizeName(storyCore.title ?? '');
	const titleMatches = gold.storyCore.titleIncludes.filter((value) =>
		normalizedTitle.includes(normalizeName(value)),
	);
	const themeMatches = gold.storyCore.themesAny.filter((value) =>
		storyCore.themes.some((theme) =>
			normalizeName(theme).includes(normalizeName(value)),
		),
	);
	const worldRuleMatches = gold.storyCore.worldRulesAny.filter((value) =>
		storyCore.rules.worldRules.some((rule) =>
			normalizeName(rule).includes(normalizeName(value)),
		),
	);
	const storyRuleMatches = gold.storyCore.storyRulesAny.filter((value) =>
		storyCore.rules.storyRules.some((rule) =>
			normalizeName(rule).includes(normalizeName(value)),
		),
	);
	const characterRuleMatches = gold.storyCore.characterRulesAny.filter(
		(value) =>
			storyCore.rules.characterRules.some((rule) =>
				normalizeName(rule).includes(normalizeName(value)),
			),
	);
	return {
		characterRuleMatches,
		storyRuleMatches,
		themeMatches,
		titleMatches,
		worldRuleMatches,
	};
}

function compareStringSets(
	left: string[],
	right: string[],
	comparator: (left: string, right: string) => boolean = namesComparable,
) {
	return {
		leftOnly: uniqueStrings(
			left.filter(
				(value) =>
					!right.some((candidate) => comparator(value, candidate)),
			),
		),
		rightOnly: uniqueStrings(
			right.filter(
				(value) =>
					!left.some((candidate) => comparator(value, candidate)),
			),
		),
	};
}

function buildChunkIndexRows(
	repeats: BenchmarkRepeatResult[],
): BenchmarkMetricRow[] {
	return repeats.flatMap((repeat) => {
		const index = repeat.isolated?.outputs.index;
		if (!index) return [];
		return index.entries.map((entry) => ({
			chunkCharCount: index.chunks[entry.chunkIndex]?.length ?? 0,
			chunkIndex: entry.chunkIndex + 1,
			eventHintCount: entry.eventHints.length,
			identityHintCount: entry.identityHints.length,
			namedCharacterCount: entry.namedCharacters.length,
			namedLocationCount: entry.namedLocations.length,
			relationshipMentionCount: entry.relationshipMentions.length,
			repeatIndex: repeat.repeatIndex,
			salienceScore: entry.salienceScore,
			sceneMarkerCount: entry.sceneMarkers.length,
			summary: entry.summary,
		}));
	});
}

function buildEntityRoutingRows(
	repeats: BenchmarkRepeatResult[],
): BenchmarkMetricRow[] {
	return repeats.flatMap((repeat) => {
		const rows: BenchmarkMetricRow[] = [];
		for (const event of repeat.pipeline.trace.events) {
			if (event.kind !== 'entity_routed') continue;
			rows.push({
				candidateChunkCount:
					typeof event.payload.candidateChunkCount === 'number'
						? event.payload.candidateChunkCount
						: 0,
				chunkCount:
					typeof event.payload.chunkCount === 'number'
						? event.payload.chunkCount
						: 0,
				chunkIndices: Array.isArray(event.payload.chunkIndices)
					? (event.payload.chunkIndices as unknown[]).join('|')
					: '',
				entityLabel:
					typeof event.payload.entityLabel === 'string'
						? event.payload.entityLabel
						: '',
				fallbackUsed: event.payload.fallbackUsed === true ? 1 : 0,
				preSpilloverSelectedCount:
					typeof event.payload.preSpilloverSelectedCount === 'number'
						? event.payload.preSpilloverSelectedCount
						: 0,
				reason:
					typeof event.payload.reason === 'string'
						? event.payload.reason
						: '',
				repeatIndex: repeat.repeatIndex,
				runType: 'pipeline',
				spilloverAddedCount:
					typeof event.payload.spilloverAddedCount === 'number'
						? event.payload.spilloverAddedCount
						: 0,
				stage: event.stage ?? '(none)',
				totalChunkCount:
					typeof event.payload.totalChunkCount === 'number'
						? event.payload.totalChunkCount
						: 0,
			});
		}
		if (!repeat.isolated) return rows;
		for (const stageRun of Object.values(repeat.isolated.runs)) {
			for (const event of stageRun.trace.events) {
				if (event.kind !== 'entity_routed') continue;
				rows.push({
					candidateChunkCount:
						typeof event.payload.candidateChunkCount === 'number'
							? event.payload.candidateChunkCount
							: 0,
					chunkCount:
						typeof event.payload.chunkCount === 'number'
							? event.payload.chunkCount
							: 0,
					chunkIndices: Array.isArray(event.payload.chunkIndices)
						? (event.payload.chunkIndices as unknown[]).join('|')
						: '',
					entityLabel:
						typeof event.payload.entityLabel === 'string'
							? event.payload.entityLabel
							: '',
					fallbackUsed: event.payload.fallbackUsed === true ? 1 : 0,
					preSpilloverSelectedCount:
						typeof event.payload.preSpilloverSelectedCount ===
						'number'
							? event.payload.preSpilloverSelectedCount
							: 0,
					reason:
						typeof event.payload.reason === 'string'
							? event.payload.reason
							: '',
					repeatIndex: repeat.repeatIndex,
					runType: 'isolated',
					spilloverAddedCount:
						typeof event.payload.spilloverAddedCount === 'number'
							? event.payload.spilloverAddedCount
							: 0,
					stage: event.stage ?? stageRun.stageLabel,
					totalChunkCount:
						typeof event.payload.totalChunkCount === 'number'
							? event.payload.totalChunkCount
							: 0,
				});
			}
		}
		return rows;
	});
}

function findMatchingRequest(
	requests: Array<{ key: string; row: BenchmarkMetricRow }>,
	stage: string,
	agent: string,
	scope: string,
	attempt: number | null,
) {
	return [...requests]
		.reverse()
		.find(
			(entry) =>
				entry.row.stage === stage &&
				entry.row.agent === agent &&
				entry.row.scope === scope &&
				entry.row.attempt === attempt,
		)?.row;
}

function buildLlmCallRows(
	repeats: BenchmarkRepeatResult[],
): BenchmarkMetricRow[] {
	const rows: BenchmarkMetricRow[] = [];
	for (const repeat of repeats) {
		for (const [runType, runs] of [
			['pipeline', [repeat.pipeline]],
			[
				'isolated',
				repeat.isolated ? Object.values(repeat.isolated.runs) : [],
			],
		] as const) {
			for (const run of runs) {
				const requests: Array<{
					key: string;
					row: BenchmarkMetricRow;
				}> = [];
				for (const event of run.trace.events) {
					if (event.kind === 'llm_request') {
						requests.push({
							key: `${requests.length + 1}`,
							row: {
								agent:
									typeof event.payload.agent === 'string'
										? event.payload.agent
										: '',
								attempt:
									typeof event.payload.attempt === 'number'
										? event.payload.attempt
										: null,
								model:
									typeof event.payload.model === 'string'
										? event.payload.model
										: '',
								promptChars:
									typeof event.payload.prompt === 'string'
										? event.payload.prompt.length
										: 0,
								repeatIndex: repeat.repeatIndex,
								runType,
								scope:
									typeof event.payload.scope === 'string'
										? event.payload.scope
										: '',
								stage: event.stage ?? run.stageLabel,
							},
						});
						continue;
					}
					if (event.kind !== 'llm_response') continue;
					const usage = event.payload.usage as
						| Record<string, unknown>
						| undefined;
					const agent =
						typeof event.payload.agent === 'string'
							? event.payload.agent
							: '';
					const scope =
						typeof event.payload.scope === 'string'
							? event.payload.scope
							: '';
					const attempt =
						typeof event.payload.attempt === 'number'
							? event.payload.attempt
							: null;
					const request = findMatchingRequest(
						requests,
						event.stage ?? run.stageLabel,
						agent,
						scope,
						attempt,
					);
					rows.push({
						agent,
						attempt,
						durationMs:
							typeof event.payload.durationMs === 'number'
								? event.payload.durationMs
								: 0,
						model:
							typeof request?.model === 'string'
								? request.model
								: '',
						promptChars:
							typeof request?.promptChars === 'number'
								? request.promptChars
								: 0,
						rawTextChars:
							typeof event.payload.rawText === 'string'
								? event.payload.rawText.length
								: 0,
						repeatIndex: repeat.repeatIndex,
						runType,
						scope,
						stage: event.stage ?? run.stageLabel,
						totalTokens:
							typeof usage?.totalTokens === 'number'
								? usage.totalTokens
								: 0,
					});
				}
			}
		}
	}
	return rows;
}

function extractStageBoundaries(
	events: Array<{ kind: string; stage: string | null; timestamp: string }>,
) {
	const boundaries = new Map<string, { complete?: string; start?: string }>();
	for (const event of events) {
		if (!event.stage) continue;
		const existing = boundaries.get(event.stage) ?? {};
		if (event.kind === 'stage_start') existing.start = event.timestamp;
		if (event.kind === 'stage_complete')
			existing.complete = event.timestamp;
		boundaries.set(event.stage, existing);
	}
	return boundaries;
}

function buildStageMetricRows(
	repeats: BenchmarkRepeatResult[],
): BenchmarkMetricRow[] {
	return repeats.flatMap((repeat) => {
		const rows: BenchmarkMetricRow[] = [];
		for (const [runType, runs] of [
			['pipeline', [repeat.pipeline]],
			[
				'isolated',
				repeat.isolated ? Object.values(repeat.isolated.runs) : [],
			],
		] as const) {
			for (const run of runs) {
				const events = run.trace.events;
				const llmResponses = events.filter(
					(event) => event.kind === 'llm_response',
				);
				const llmDurations = llmResponses
					.map((event) =>
						typeof event.payload.durationMs === 'number'
							? event.payload.durationMs
							: 0,
					)
					.filter((value) => value > 0);
				const chunkPlans = events.filter(
					(event) => event.kind === 'chunk_plan_created',
				);
				const routedEntities = events.filter(
					(event) => event.kind === 'entity_routed',
				);
				const boundaries = extractStageBoundaries(events).get(
					run.stageLabel,
				);
				rows.push({
					avgLlmDurationMs: Number(average(llmDurations).toFixed(2)),
					avgSelectedChunksPerEntity:
						routedEntities.length > 0
							? Number(
									average(
										routedEntities.map((event) =>
											typeof event.payload.chunkCount ===
											'number'
												? event.payload.chunkCount
												: 0,
										),
									).toFixed(2),
								)
							: 0,
					chunkPlanCount: chunkPlans.length,
					durationMs: run.durationMs,
					entityRoutedCount: routedEntities.length,
					errorCount: events.filter((event) =>
						event.kind.endsWith('_error'),
					).length,
					internalStages: uniqueStrings(
						events
							.map((event) => event.stage ?? '')
							.filter(Boolean),
					).join('|'),
					llmRequestCount: events.filter(
						(event) => event.kind === 'llm_request',
					).length,
					llmResponseCount: llmResponses.length,
					llmRetryCount: events.filter(
						(event) => event.kind === 'llm_retry',
					).length,
					llmTotalTokens: llmResponses.reduce((sum, event) => {
						const usage = event.payload.usage as
							| Record<string, unknown>
							| undefined;
						return (
							sum +
							(typeof usage?.totalTokens === 'number'
								? usage.totalTokens
								: 0)
						);
					}, 0),
					observedDurationMs:
						events.length > 0
							? toTimestampMs(events.at(-1)?.timestamp) -
								toTimestampMs(events[0]?.timestamp)
							: 0,
					outputSummary: JSON.stringify(
						runType === 'pipeline'
							? (() => {
									const output = run.output as {
										characters: unknown[];
										locations: unknown[];
										memories: unknown[];
									};
									return {
										characterCount:
											output.characters.length,
										locationCount: output.locations.length,
										memoryCount: output.memories.length,
									};
								})()
							: { kind: typeof run.output },
					),
					repeatIndex: repeat.repeatIndex,
					runType,
					selectedChunkCount: chunkPlans.reduce((sum, event) => {
						const chunkCount = event.payload.chunkCount;
						return (
							sum +
							(typeof chunkCount === 'number' ? chunkCount : 0)
						);
					}, 0),
					stageLabel: run.stageLabel,
					stageStartCompleteDurationMs:
						boundaries?.start && boundaries.complete
							? toTimestampMs(boundaries.complete) -
								toTimestampMs(boundaries.start)
							: 0,
					toolCallCount: events.filter(
						(event) => event.kind === 'tool_call',
					).length,
					totalChunkCount: chunkPlans.reduce((max, event) => {
						const total =
							typeof event.payload.totalChunkCount === 'number'
								? event.payload.totalChunkCount
								: typeof event.payload.chunkCount === 'number'
									? event.payload.chunkCount
									: 0;
						return Math.max(max, total);
					}, 0),
					warningCount: events.filter(
						(event) => event.kind === 'warning',
					).length,
				});
			}
		}
		return rows;
	});
}

function summarizeRoutingRows(entityRoutingRows: BenchmarkMetricRow[]) {
	const stageSummaries = new Map<
		string,
		{
			chunkCounts: number[];
			routedCount: number;
			spilloverCounts: number[];
			totalChunkCounts: number[];
		}
	>();

	for (const row of entityRoutingRows) {
		const key = `${row.runType}:${row.stage}`;
		const existing = stageSummaries.get(key) ?? {
			chunkCounts: [],
			routedCount: 0,
			spilloverCounts: [],
			totalChunkCounts: [],
		};
		existing.chunkCounts.push(
			typeof row.chunkCount === 'number' ? row.chunkCount : 0,
		);
		existing.routedCount += 1;
		existing.spilloverCounts.push(
			typeof row.spilloverAddedCount === 'number'
				? row.spilloverAddedCount
				: 0,
		);
		existing.totalChunkCounts.push(
			typeof row.totalChunkCount === 'number' ? row.totalChunkCount : 0,
		);
		stageSummaries.set(key, existing);
	}

	return [...stageSummaries.entries()].map(([key, summary]) => {
		const [runType, stage] = key.split(':');
		const meanChunkCount = average(summary.chunkCounts);
		const meanTotalChunkCount = average(summary.totalChunkCounts);
		return {
			avgChunkCountPerEntity: Number(meanChunkCount.toFixed(2)),
			avgSpilloverAdded: Number(
				average(summary.spilloverCounts).toFixed(2),
			),
			entityCount: summary.routedCount,
			fullScanGuardrailTriggered:
				meanTotalChunkCount > 0 &&
				meanChunkCount / meanTotalChunkCount > 0.5,
			runType,
			stage,
		};
	});
}

function summarizeLlmRows(llmCallRows: BenchmarkMetricRow[]) {
	const perRepeat = new Map<
		number,
		{ callCount: number; durationMs: number; totalTokens: number }
	>();
	for (const row of llmCallRows) {
		const repeatIndex =
			typeof row.repeatIndex === 'number' ? row.repeatIndex : 1;
		const existing = perRepeat.get(repeatIndex) ?? {
			callCount: 0,
			durationMs: 0,
			totalTokens: 0,
		};
		existing.callCount += 1;
		existing.durationMs +=
			typeof row.durationMs === 'number' ? row.durationMs : 0;
		existing.totalTokens +=
			typeof row.totalTokens === 'number' ? row.totalTokens : 0;
		perRepeat.set(repeatIndex, existing);
	}

	const perRepeatRows = [...perRepeat.entries()].map(
		([repeatIndex, row]) => ({
			callCount: row.callCount,
			durationMs: row.durationMs,
			repeatIndex,
			totalTokens: row.totalTokens,
		}),
	);
	return {
		averageCalls: Number(
			average(perRepeatRows.map((row) => row.callCount)).toFixed(2),
		),
		averageDurationMs: Number(
			average(perRepeatRows.map((row) => row.durationMs)).toFixed(2),
		),
		averageTokens: Number(
			average(perRepeatRows.map((row) => row.totalTokens)).toFixed(2),
		),
		perRepeat: perRepeatRows,
		totalRows: llmCallRows.length,
	};
}

function buildQualityForRepeat(
	repeat: BenchmarkRepeatResult,
	gold: BenchmarkGold,
) {
	const characterNames = repeat.pipeline.output.characters.map(
		(character) => character.name,
	);
	const locationNames = repeat.pipeline.output.locations.map(
		(location) => location.name,
	);
	const characterGroundTruth = scoreNames(characterNames, gold.characters);
	const locationGroundTruth = scoreNames(locationNames, gold.locations);
	const identityLinks = scoreIdentityLinks(
		repeat.pipeline.output.characters,
		gold,
	);
	const keyMemories = scoreKeyMemories(repeat.pipeline.output.memories, gold);
	const storyCoreGold = scoreStoryCoreAnchors(
		repeat.pipeline.output.storyCore,
		gold,
	);
	const locationSummary = summarizeLocations(
		repeat.pipeline.output.locations,
	);
	const memorySummary = summarizeMemories(repeat.pipeline.output.memories);
	const storyCoreSummary = summarizeStoryCore(
		repeat.pipeline.output.storyCore,
	);
	const characterSummary = summarizeCharacters(
		repeat.pipeline.output.characters,
	);
	const drift =
		repeat.isolated === null
			? null
			: {
					characters: compareStringSets(
						repeat.pipeline.output.characters.map(
							(character) => character.name,
						),
						repeat.isolated.outputs.charactersFinal.map(
							(character) => character.name,
						),
					),
					locations: compareStringSets(
						repeat.pipeline.output.locations.map(
							(location) => location.name,
						),
						repeat.isolated.outputs.locations.map(
							(location) => location.name,
						),
					),
					memories: compareStringSets(
						repeat.pipeline.output.memories.map(
							(memory) =>
								`${memory.characterName}::${memory.summary}`,
						),
						repeat.isolated.outputs.memories.map(
							(memory) =>
								`${memory.characterName}::${memory.summary}`,
						),
						(left, right) =>
							normalizeWhitespace(left).toLowerCase() ===
							normalizeWhitespace(right).toLowerCase(),
					),
					storyCore: {
						pipelineTitle: repeat.pipeline.output.storyCore.title,
						stageTitle: repeat.isolated.outputs.storyCore.title,
					},
				};

	return {
		characterGroundTruth,
		characterSummary,
		drift,
		identityLinks,
		keyMemories,
		locationGroundTruth,
		locationSummary,
		memorySummary,
		repeatIndex: repeat.repeatIndex,
		storyCoreGold,
		storyCoreSummary,
	};
}

function summarizeQualityAcrossRepeats(
	repeatQuality: ReturnType<typeof buildQualityForRepeat>[],
) {
	const characterRecalls = repeatQuality
		.map((row) => row.characterGroundTruth.recall)
		.filter(
			(value): value is number =>
				value !== null && Number.isFinite(value),
		);
	const locationRecalls = repeatQuality
		.map((row) => row.locationGroundTruth.recall)
		.filter(
			(value): value is number =>
				value !== null && Number.isFinite(value),
		);
	const identityRecalls = repeatQuality
		.map((row) => row.identityLinks.recall)
		.filter(
			(value): value is number =>
				value !== null && Number.isFinite(value),
		);
	const memoryCoverage = repeatQuality
		.map((row) => row.keyMemories.coverage)
		.filter(
			(value): value is number =>
				value !== null && Number.isFinite(value),
		);
	const first = repeatQuality[0];

	return {
		characterGroundTruth: first.characterGroundTruth,
		characterSummary: first.characterSummary,
		identityLinks: first.identityLinks,
		keyMemories: first.keyMemories,
		locationGroundTruth: first.locationGroundTruth,
		locationSummary: first.locationSummary,
		memorySummary: first.memorySummary,
		perRepeat: repeatQuality,
		repeatAverages: {
			characterRecall:
				characterRecalls.length > 0
					? Number(average(characterRecalls).toFixed(3))
					: null,
			identityLinkRecall:
				identityRecalls.length > 0
					? Number(average(identityRecalls).toFixed(3))
					: null,
			keyMemoryCoverage:
				memoryCoverage.length > 0
					? Number(average(memoryCoverage).toFixed(3))
					: null,
			locationRecall:
				locationRecalls.length > 0
					? Number(average(locationRecalls).toFixed(3))
					: null,
		},
		storyCoreGold: first.storyCoreGold,
		storyCoreSummary: first.storyCoreSummary,
	};
}

function buildQualitySnapshot(
	repeats: BenchmarkRepeatResult[],
	repeatQuality: ReturnType<typeof buildQualityForRepeat>[],
	llmCallRows: BenchmarkMetricRow[],
): BenchmarkSummarySnapshot {
	const pipelineDurations = repeats.map(
		(repeat) => repeat.pipeline.durationMs,
	);
	const characterCounts = repeats.map(
		(repeat) => repeat.pipeline.output.characters.length,
	);
	const locationCounts = repeats.map(
		(repeat) => repeat.pipeline.output.locations.length,
	);
	const memoryCounts = repeats.map(
		(repeat) => repeat.pipeline.output.memories.length,
	);
	const locationWarnings = repeatQuality.map(
		(row) => row.locationSummary.duplicateWarningCount,
	);
	const memoriesWithDeltasRates = repeatQuality.map(
		(row) => row.memorySummary.memoriesWithDeltasRate,
	);
	const characterRecalls = repeatQuality
		.map((row) => row.characterGroundTruth.recall)
		.filter(
			(value): value is number =>
				value !== null && Number.isFinite(value),
		);
	const locationRecalls = repeatQuality
		.map((row) => row.locationGroundTruth.recall)
		.filter(
			(value): value is number =>
				value !== null && Number.isFinite(value),
		);
	const identityRecalls = repeatQuality.map(
		(row) => row.identityLinks.recall,
	);
	const memoryCoverage = repeatQuality.map((row) => row.keyMemories.coverage);

	return {
		characterCount: Math.round(average(characterCounts)),
		characterRecall:
			characterRecalls.length > 0
				? Number(average(characterRecalls).toFixed(3))
				: null,
		duplicateLocationWarnings: Number(average(locationWarnings).toFixed(2)),
		identityLinkRecall:
			identityRecalls.filter((value): value is number => value !== null)
				.length > 0
				? Number(
						average(
							identityRecalls.filter(
								(value): value is number => value !== null,
							),
						).toFixed(3),
					)
				: null,
		keyMemoryCoverage:
			memoryCoverage.filter((value): value is number => value !== null)
				.length > 0
				? Number(
						average(
							memoryCoverage.filter(
								(value): value is number => value !== null,
							),
						).toFixed(3),
					)
				: null,
		locationCount: Math.round(average(locationCounts)),
		locationRecall:
			locationRecalls.length > 0
				? Number(average(locationRecalls).toFixed(3))
				: null,
		memoriesWithDeltasRate: Number(
			average(memoriesWithDeltasRates).toFixed(3),
		),
		memoryCount: Math.round(average(memoryCounts)),
		pipelineDurationMs: Number(average(pipelineDurations).toFixed(2)),
		totalLlmCalls: Math.round(
			average(
				repeats.map(
					(repeat) =>
						llmCallRows.filter(
							(row) =>
								row.runType === 'pipeline' &&
								row.repeatIndex === repeat.repeatIndex,
						).length,
				),
			),
		),
	};
}

function summarizeInput(
	loadedStory: BenchmarkLoadedStory,
	repeats: BenchmarkRepeatResult[],
) {
	const sanitizedText = sanitizeTextForParsing(loadedStory.text);
	const chunks =
		repeats[0].isolated?.outputs.index.chunks ?? chunkText(sanitizedText);
	const chunkLengths = chunks.map((chunk) => chunk.length);
	return {
		chunkCharsAverage: Number(average(chunkLengths).toFixed(2)),
		chunkCharsMax: Math.max(...chunkLengths),
		chunkCharsMedian: median(chunkLengths),
		chunkCharsMin: Math.min(...chunkLengths),
		chunkCount: chunks.length,
		overlapRatio: Number((300 / 3000).toFixed(3)),
		sanitizedChars: sanitizedText.length,
		sceneMarkerCount:
			repeats[0].isolated?.outputs.index.manifest.sceneNames.length ?? 0,
		sourceChars: loadedStory.text.length,
	};
}

function summarizeRepeatVariance(
	qualitySnapshot: BenchmarkSummarySnapshot,
	repeats: BenchmarkRepeatResult[],
	llmCallRows: BenchmarkMetricRow[],
	repeatQuality: ReturnType<typeof buildQualityForRepeat>[],
) {
	if (repeats.length <= 1) return null;
	const pipelineDurations = repeats.map(
		(repeat) => repeat.pipeline.durationMs,
	);
	const llmCalls = repeats.map(
		(repeat) =>
			llmCallRows.filter(
				(row) =>
					row.runType === 'pipeline' &&
					row.repeatIndex === repeat.repeatIndex,
			).length,
	);
	const characterRecalls = repeatQuality
		.map((row) => row.characterGroundTruth.recall)
		.filter(
			(value): value is number =>
				value !== null && Number.isFinite(value),
		);
	const locationRecalls = repeatQuality
		.map((row) => row.locationGroundTruth.recall)
		.filter(
			(value): value is number =>
				value !== null && Number.isFinite(value),
		);
	const memoryCoverage = repeatQuality.map((row) => row.keyMemories.coverage);

	return {
		characterRecallStdDev: Number(
			standardDeviation(characterRecalls).toFixed(4),
		),
		keyMemoryCoverageStdDev: Number(
			standardDeviation(
				memoryCoverage.filter(
					(value): value is number => value !== null,
				),
			).toFixed(4),
		),
		locationRecallStdDev: Number(
			standardDeviation(locationRecalls).toFixed(4),
		),
		pipelineDurationMsMean: qualitySnapshot.pipelineDurationMs,
		pipelineDurationMsStdDev: Number(
			standardDeviation(pipelineDurations).toFixed(2),
		),
		totalLlmCallsMean: qualitySnapshot.totalLlmCalls,
		totalLlmCallsStdDev: Number(standardDeviation(llmCalls).toFixed(2)),
	};
}

export function buildMetricRegistryOutput(
	loadedStory: BenchmarkLoadedStory,
	repeats: BenchmarkRepeatResult[],
): BenchmarkMetricRegistryOutput {
	const chunkIndexRows = buildChunkIndexRows(repeats);
	const entityRoutingRows = buildEntityRoutingRows(repeats);
	const llmCallRows = buildLlmCallRows(repeats);
	const stageMetricRows = buildStageMetricRows(repeats);
	const repeatQuality = repeats.map((repeat) =>
		buildQualityForRepeat(repeat, loadedStory.gold),
	);
	const quality = summarizeQualityAcrossRepeats(repeatQuality);
	const qualitySnapshot = buildQualitySnapshot(
		repeats,
		repeatQuality,
		llmCallRows,
	);
	const firstIndex = repeats[0].isolated?.outputs.index ?? null;

	return {
		chunkIndexRows,
		entityRoutingRows,
		families: {
			baselineComparison: null,
			drift: {
				perRepeat: repeatQuality.map((repeat) => ({
					drift: repeat.drift,
					repeatIndex: repeat.repeatIndex,
				})),
			},
			index: firstIndex ? summarizeIndex(firstIndex) : null,
			input: summarizeInput(loadedStory, repeats),
			llm: summarizeLlmRows(llmCallRows),
			quality,
			repeatVariance: summarizeRepeatVariance(
				qualitySnapshot,
				repeats,
				llmCallRows,
				repeatQuality,
			),
			routing: {
				perStage: summarizeRoutingRows(entityRoutingRows),
			},
		},
		llmCallRows,
		qualitySnapshot,
		stageMetricRows,
	};
}
