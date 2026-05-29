import { z } from 'zod';
import { MemoryDeltaSchema } from './memory.js';
import { StoryRulesSchema, WritingStyleSchema } from './story.js';

export const ImportJobStatusSchema = z.enum([
	'queued',
	'running',
	'completed',
	'failed',
	'cancelled',
]);
export type ImportJobStatus = z.infer<typeof ImportJobStatusSchema>;

export const ImportCharacterRelationshipSchema = z.object({
	emotion: z.string().default(''),
	otherCharacterName: z.string(),
	privateAttitude: z.string().default(''),
	publicAttitude: z.string().default(''),
	trustLevel: z.number().min(0).max(10).default(5),
});
export type ImportCharacterRelationship = z.infer<
	typeof ImportCharacterRelationshipSchema
>;

export const ImportCharacterIdentitySchema = z.object({
	abilities: z.array(z.string()).default([]),
	appearance: z.string().default(''),
	conditions: z.string().default(''),
	id: z.string(),
	knownBy: z.array(z.string()).default([]),
	name: z.string(),
	notes: z.string().default(''),
	selfAware: z.boolean().default(true),
});
export type ImportCharacterIdentity = z.infer<
	typeof ImportCharacterIdentitySchema
>;

export const ImportStoryCoreSchema = z.object({
	genres: z.array(z.string()).default([]),
	premise: z.string().default(''),
	rules: StoryRulesSchema.default(() => ({
		characterRules: [],
		storyRules: [],
		worldRules: [],
	})),
	themes: z.array(z.string()).default([]),
	title: z.string().default(''),
	tone: z.array(z.string()).default([]),
	writingStyle: WritingStyleSchema.default(() => ({
		dialogue: '',
		interiority: '',
		pacing: '',
		prose: '',
		sensory: '',
	})),
});
export type ImportStoryCore = z.infer<typeof ImportStoryCoreSchema>;

export const ImportCharacterSchema = z.object({
	age: z.string().default(''),
	appearance: z.string().default(''),
	clothing: z.string().default(''),
	fears: z.array(z.string()).default([]),
	gender: z.string().default(''),
	identities: z.array(ImportCharacterIdentitySchema).default([]),
	isUserPersona: z.boolean().default(false),
	linkedCharacterNames: z.array(z.string()).default([]),
	name: z.string(),
	personality: z.array(z.string()).default([]),
	relationships: z.array(ImportCharacterRelationshipSchema).default([]),
	role: z.string().default(''),
	species: z.string().default('human'),
	speechStyle: z.string().default(''),
	trueMotives: z.string().default(''),
});
export type ImportCharacter = z.infer<typeof ImportCharacterSchema>;

export const ImportLocationSchema = z.object({
	atmosphere: z.string().default(''),
	connectedLocationNames: z.array(z.string()).default([]),
	description: z.string().default(''),
	layout: z.string().default(''),
	lighting: z.string().default(''),
	name: z.string(),
	notes: z.string().default(''),
	parentLocationName: z.string().nullable().default(null),
	smells: z.string().default(''),
	soundscape: z.string().default(''),
	tags: z.array(z.string()).default([]),
});
export type ImportLocation = z.infer<typeof ImportLocationSchema>;

export const ImportMemorySchema = z.object({
	characterName: z.string(),
	deltas: MemoryDeltaSchema.default({ effects: [] }),
	importance: z.number().min(0).max(1).default(0.5),
	isGenesis: z.boolean().default(false),
	sceneId: z.string().nullable().default(null),
	storyOrder: z.number().int().default(0),
	summary: z.string(),
	tags: z.array(z.string()).default([]),
});
export type ImportMemory = z.infer<typeof ImportMemorySchema>;

export const ImportJobPartialResultSchema = z.object({
	characters: z.array(ImportCharacterSchema).default([]),
	locations: z.array(ImportLocationSchema).default([]),
	memories: z.array(ImportMemorySchema).default([]),
	storyCore: ImportStoryCoreSchema.nullable().default(null),
});
export type ImportJobPartialResult = z.infer<
	typeof ImportJobPartialResultSchema
>;

export const ImportJobCharacterProgressSchema = z.object({
	detail: z.string().optional(),
	name: z.string(),
	status: z.enum(['pending', 'running', 'complete', 'error']),
	updatedAt: z.string(),
});
export type ImportJobCharacterProgress = z.infer<
	typeof ImportJobCharacterProgressSchema
>;

export const ImportJobEventKindSchema = z.enum([
	'job_created',
	'job_started',
	'job_completed',
	'job_failed',
	'job_cancelled',
	'subscriber_connected',
	'subscriber_disconnected',
	'stage_start',
	'stage_complete',
	'stage_error',
	'index_start',
	'index_complete',
	'index_error',
	'routing_start',
	'routing_complete',
	'routing_error',
	'entity_routed',
	'character_start',
	'character_complete',
	'character_error',
	'chunk_plan_created',
	'chunk_start',
	'chunk_complete',
	'chunk_error',
	'consolidation_start',
	'consolidation_complete',
	'consolidation_error',
	'skill_call',
	'skill_result',
	'skill_error',
	'agent_start',
	'agent_complete',
	'agent_error',
	'agent_handoff',
	'tool_call',
	'tool_result',
	'tool_error',
	'llm_request',
	'llm_response',
	'llm_retry',
	'mcp_stage_enabled',
	'mcp_stage_skipped',
	'partial_result',
	'warning',
	'heartbeat',
]);
export type ImportJobEventKind = z.infer<typeof ImportJobEventKindSchema>;

export const ImportJobEventSchema = z.object({
	jobId: z.string(),
	kind: ImportJobEventKindSchema,
	payload: z.record(z.string(), z.unknown()).default({}),
	seq: z.number().int().nonnegative(),
	stage: z.string().nullable().default(null),
	timestamp: z.string(),
});
export type ImportJobEvent = z.infer<typeof ImportJobEventSchema>;

export const ImportJobSnapshotSchema = z.object({
	characterProgress: z.array(ImportJobCharacterProgressSchema).default([]),
	createdAt: z.string(),
	currentStage: z.string().nullable().default(null),
	error: z.string().nullable().default(null),
	jobId: z.string(),
	lastHeartbeatAt: z.string().nullable().default(null),
	lastSeq: z.number().int().nonnegative().default(0),
	partialResult: ImportJobPartialResultSchema.default(() => ({
		characters: [],
		locations: [],
		memories: [],
		storyCore: null,
	})),
	sourceHash: z.string(),
	sourceLength: z.number().int().nonnegative(),
	sourcePreview: z.string(),
	status: ImportJobStatusSchema,
	updatedAt: z.string(),
	warningCount: z.number().int().nonnegative().default(0),
});
export type ImportJobSnapshot = z.infer<typeof ImportJobSnapshotSchema>;

export const ImportJobSummarySchema = ImportJobSnapshotSchema.pick({
	createdAt: true,
	currentStage: true,
	error: true,
	jobId: true,
	lastHeartbeatAt: true,
	lastSeq: true,
	sourceHash: true,
	sourceLength: true,
	sourcePreview: true,
	status: true,
	updatedAt: true,
	warningCount: true,
});
export type ImportJobSummary = z.infer<typeof ImportJobSummarySchema>;
