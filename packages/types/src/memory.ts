import { z } from 'zod';

export const DeltaValueSchema = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null(),
	z.array(z.string()),
	z.array(z.record(z.string(), z.unknown())),
	z.record(z.string(), z.unknown()),
]);

export const DeltaOperationSchema = z.enum([
	'set',
	'unset',
	'add',
	'remove',
	'increment',
	'decrement',
]);

export const MemoryDeltaEffectSchema = z.object({
	entityType: z.string().min(1).default('character'),
	op: DeltaOperationSchema,
	path: z.string().min(1),
	targetId: z.string().optional(),
	value: DeltaValueSchema.optional(),
	weight: z.number().min(0).max(1).default(1),
});

export const MemoryDeltaSchema = z.object({
	effects: z.array(MemoryDeltaEffectSchema).default([]),
});

export type MemoryDelta = z.infer<typeof MemoryDeltaSchema>;
export type MemoryDeltaEffect = z.infer<typeof MemoryDeltaEffectSchema>;

export const MemoryItemSchema = z.object({
	createdAt: z.string(),
	deltas: MemoryDeltaSchema.default({ effects: [] }),
	embedding: z.array(z.number()).optional(),
	id: z.string(),
	importance: z.number().min(0).max(1).default(0.5),
	isGenesis: z.boolean().default(false),
	locationId: z.string().optional(),
	sceneId: z.string().nullable().default(null),
	sourceChatId: z.string().optional(),
	sourceTurnId: z.string().optional(),
	storyId: z.string(),
	storyOrder: z.number().int().default(0),
	summary: z.string().min(1),
	tags: z.array(z.string()).default([]),
	updatedAt: z.string(),
});

export const MemoryItemCreateSchema = MemoryItemSchema.omit({
	createdAt: true,
	id: true,
	storyId: true,
	updatedAt: true,
}).partial({
	isGenesis: true,
	sceneId: true,
	storyOrder: true,
});

// ─── CharacterMemoryRelation (join table) ────────────────────────────────────

export const CharacterMemoryRelationSchema = z.object({
	branchLabel: z.string().optional(),
	characterId: z.string(),
	createdAt: z.string(),
	id: z.string(),
	memoryId: z.string(),
	previousRelationId: z.string().optional(),
	storyId: z.string(),
});

export const CharacterMemoryRelationCreateSchema =
	CharacterMemoryRelationSchema.omit({ createdAt: true, id: true });

// Combined payload for POST /memories — content + relation fields bundled
export const CharacterMemoryWithRelationCreateSchema =
	MemoryItemCreateSchema.extend({
		branchLabel: z.string().optional(),
		previousRelationId: z.string().optional(),
	});

export const CharacterMemoryUpdateSchema =
	CharacterMemoryWithRelationCreateSchema.partial();

export type MemoryItem = z.infer<typeof MemoryItemSchema>;
export type MemoryItemCreate = z.infer<typeof MemoryItemCreateSchema>;

export type CharacterMemory = MemoryItem;
export type CharacterMemoryRelation = z.infer<
	typeof CharacterMemoryRelationSchema
>;
export type CharacterMemoryRelationCreate = z.infer<
	typeof CharacterMemoryRelationCreateSchema
>;
export type CharacterMemoryCreate = z.infer<
	typeof CharacterMemoryWithRelationCreateSchema
>;
export type CharacterMemoryUpdate = z.infer<typeof CharacterMemoryUpdateSchema>;
