import { z } from 'zod';

export const DeltaValueSchema = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null(),
	z.array(z.string()),
	z.array(z.record(z.unknown())),
	z.record(z.unknown()),
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
	path: z.string().min(1),
	op: DeltaOperationSchema,
	value: DeltaValueSchema.optional(),
	weight: z.number().min(0).max(1).default(1),
	entityType: z.string().min(1).default('character'),
	targetId: z.string().optional(),
});

export const MemoryDeltaSchema = z.object({
	effects: z.array(MemoryDeltaEffectSchema).default([]),
});

export type MemoryDelta = z.infer<typeof MemoryDeltaSchema>;
export type MemoryDeltaEffect = z.infer<typeof MemoryDeltaEffectSchema>;

export const MemoryItemSchema = z.object({
	id: z.string(),
	storyId: z.string(),
	summary: z.string().min(1),
	tags: z.array(z.string()).default([]),
	importance: z.number().min(0).max(1).default(0.5),

	locationId: z.string().optional(),
	sourceChatId: z.string().optional(),
	sourceTurnId: z.string().optional(),

	sceneId: z.string().nullable().default(null),
	storyOrder: z.number().int().default(0),
	isGenesis: z.boolean().default(false),

	deltas: MemoryDeltaSchema.default({ effects: [] }),

	createdAt: z.string(),
	updatedAt: z.string(),
});

export const MemoryItemCreateSchema = MemoryItemSchema.omit({
	id: true,
	storyId: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	sceneId: true,
	storyOrder: true,
	isGenesis: true,
});

// ─── CharacterMemoryRelation (join table) ────────────────────────────────────

export const CharacterMemoryRelationSchema = z.object({
	id: z.string(),
	storyId: z.string(),
	characterId: z.string(),
	memoryId: z.string(),
	previousRelationId: z.string().optional(),
	branchLabel: z.string().optional(),
	createdAt: z.string(),
});

export const CharacterMemoryRelationCreateSchema =
	CharacterMemoryRelationSchema.omit({ id: true, createdAt: true });

// Combined payload for POST /memories — content + relation fields bundled
export const CharacterMemoryWithRelationCreateSchema =
	MemoryItemCreateSchema.extend({
		previousRelationId: z.string().optional(),
		branchLabel: z.string().optional(),
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
