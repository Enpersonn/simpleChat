import { z } from 'zod';
import type { EntityManifest, ParsingIndex } from '../indexing.js';
import type { MultiPassResult } from '../pipeline.js';
import type { ParseContext } from '../service.js';
import type {
	NormalisedCharacter,
	NormalisedLocation,
	NormalisedMemory,
	NormalisedStoryCore,
	StoryStageRuntimeContext,
} from '../stages.js';
import type {
	ParseTraceCharacterUpdate,
	ParseTracePartialUpdate,
} from '../trace-types.js';
import type { ParseVerboseEvent } from '../verbose-types.js';

export const BenchmarkStoryCoreGoldSchema = z.object({
	characterRulesAny: z.array(z.string()).default([]),
	storyRulesAny: z.array(z.string()).default([]),
	themesAny: z.array(z.string()).default([]),
	titleIncludes: z.array(z.string()).default([]),
	worldRulesAny: z.array(z.string()).default([]),
});

export const BenchmarkIdentityLinkSchema = z.object({
	left: z.string(),
	right: z.string(),
});

export const BenchmarkKeyMemorySchema = z.object({
	characterName: z.string(),
	id: z.string(),
	importanceMin: z.number().min(0).max(1).optional(),
	sceneId: z.string().optional(),
	summaryIncludesAny: z.array(z.string()).min(1),
});

export const BenchmarkGoldSchema = z.object({
	characters: z.array(z.string()).default([]),
	identityLinks: z.array(BenchmarkIdentityLinkSchema).default([]),
	keyMemories: z.array(BenchmarkKeyMemorySchema).default([]),
	locations: z.array(z.string()).default([]),
	storyCore: BenchmarkStoryCoreGoldSchema.default(() => ({
		characterRulesAny: [],
		storyRulesAny: [],
		themesAny: [],
		titleIncludes: [],
		worldRulesAny: [],
	})),
});

export type BenchmarkGold = z.infer<typeof BenchmarkGoldSchema>;

export interface BenchmarkStoryManifest {
	baselinePath: string;
	context?: ParseContext;
	fixturePath: string;
	goldPath: string;
	id: string;
	notes?: string[];
	slices: string[];
	tags: string[];
	title: string;
}

export type TraceRecord = {
	kind: string;
	payload: Record<string, unknown>;
	sequence: number;
	stage: string | null;
	timestamp: string;
};

export type PartialTraceRecord = ParseTracePartialUpdate & {
	sequence: number;
	timestamp: string;
};

export type VerboseRecord = ParseVerboseEvent & {
	repeatIndex: number;
	runType: 'isolated' | 'pipeline';
	sequence: number;
	stageLabel: string;
	timestamp: string;
};

export interface BenchmarkStageRun<TOutput> {
	durationMs: number;
	output: TOutput;
	stageLabel: string;
	trace: {
		characterProgress: ParseTraceCharacterUpdate[];
		currentStage: string | null;
		events: TraceRecord[];
		partials: PartialTraceRecord[];
	};
	verbose: VerboseRecord[];
}

export interface BenchmarkIsolatedStageOutputs {
	charactersBase: NormalisedCharacter[];
	charactersFinal: NormalisedCharacter[];
	charactersWithRelationships: NormalisedCharacter[];
	index: ParsingIndex;
	locations: NormalisedLocation[];
	manifest: EntityManifest;
	memories: NormalisedMemory[];
	storyCore: NormalisedStoryCore;
}

export interface BenchmarkRepeatResult {
	durationMs: number;
	isolated: {
		outputs: BenchmarkIsolatedStageOutputs;
		runs: Record<string, BenchmarkStageRun<unknown>>;
	} | null;
	pipeline: BenchmarkStageRun<MultiPassResult>;
	repeatIndex: number;
	startedAt: string;
}

export type BenchmarkMetricRow = Record<
	string,
	string | number | boolean | null | undefined
>;

export interface BenchmarkBaselineStageMetric {
	avgSelectedChunksPerEntity: number;
	durationMs: number;
	llmRequestCount: number;
	llmTotalTokens: number;
	runType: 'isolated' | 'pipeline';
	selectedChunkCount: number;
	stageLabel: string;
	warningCount: number;
}

export interface BenchmarkSummarySnapshot {
	characterCount: number;
	characterRecall: number | null;
	duplicateLocationWarnings: number;
	identityLinkRecall: number | null;
	keyMemoryCoverage: number | null;
	locationCount: number;
	locationRecall: number | null;
	memoriesWithDeltasRate: number;
	memoryCount: number;
	pipelineDurationMs: number;
	totalLlmCalls: number;
}

export const BaselineSummarySnapshotSchema = z.object({
	characterCount: z.number(),
	characterRecall: z.number().nullable(),
	duplicateLocationWarnings: z.number(),
	identityLinkRecall: z.number().nullable(),
	keyMemoryCoverage: z.number().nullable(),
	locationCount: z.number(),
	locationRecall: z.number().nullable(),
	memoriesWithDeltasRate: z.number(),
	memoryCount: z.number(),
	pipelineDurationMs: z.number(),
	totalLlmCalls: z.number(),
});

export const BaselineStageMetricSchema = z.object({
	avgSelectedChunksPerEntity: z.number(),
	durationMs: z.number(),
	llmRequestCount: z.number(),
	llmTotalTokens: z.number(),
	runType: z.enum(['isolated', 'pipeline']),
	selectedChunkCount: z.number(),
	stageLabel: z.string(),
	warningCount: z.number(),
});

export const BaselineSnapshotSchema = z.object({
	blessedAt: z.string(),
	fixtureHash: z.string(),
	parserVersion: z.literal(1),
	stageMetrics: z.array(BaselineStageMetricSchema).default([]),
	storyId: z.string(),
	summary: BaselineSummarySnapshotSchema,
});

export type BaselineSnapshot = z.infer<typeof BaselineSnapshotSchema>;

export type BenchmarkFindingSeverity = 'high' | 'info' | 'warning';

export interface BenchmarkFinding {
	code: string;
	detail: string;
	severity: BenchmarkFindingSeverity;
	stage?: string | null;
	title: string;
}

export interface BenchmarkRunInput {
	blessBaseline: boolean;
	loadedStory: BenchmarkLoadedStory;
	outputRootDir: string;
	pipelineOnly: boolean;
	repeatCount: number;
}

export interface BenchmarkLoadedStory {
	baseline: BaselineSnapshot | null;
	context?: ParseContext;
	fixtureHash: string;
	gold: BenchmarkGold;
	manifest: BenchmarkStoryManifest;
	originalPath: string;
	text: string;
}

export interface BenchmarkMetricRegistryOutput {
	chunkIndexRows: BenchmarkMetricRow[];
	entityRoutingRows: BenchmarkMetricRow[];
	families: {
		baselineComparison: Record<string, unknown> | null;
		drift: Record<string, unknown>;
		index: Record<string, unknown> | null;
		input: Record<string, unknown>;
		llm: Record<string, unknown>;
		quality: Record<string, unknown>;
		repeatVariance: Record<string, unknown> | null;
		routing: Record<string, unknown>;
	};
	llmCallRows: BenchmarkMetricRow[];
	qualitySnapshot: BenchmarkSummarySnapshot;
	stageMetricRows: BenchmarkMetricRow[];
}

export interface BenchmarkCompletedRun {
	findings: BenchmarkFinding[];
	loadedStory: BenchmarkLoadedStory;
	metrics: BenchmarkMetricRegistryOutput;
	repeats: BenchmarkRepeatResult[];
	storyOutDir: string;
}

export type IsolatedStageRunner = (
	context: StoryStageRuntimeContext,
) => Promise<unknown>;
