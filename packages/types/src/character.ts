import { z } from 'zod';

export const LocationRelationshipSchema = z.object({
	comfort: z.number().min(0).max(10).default(5),
	emotion: z.string().default(''),
	locationId: z.string(),
	notes: z.string().default(''),
	sourceMemoryId: z.string().optional(),
	tension: z.number().min(0).max(10).default(0),
});
export type LocationRelationship = z.infer<typeof LocationRelationshipSchema>;

export const VisibilitySchema = z.union([
	z.literal('public'),
	z.literal('narrator-only'),
	z.string().regex(/^party:.+/),
	z.string().regex(/^character:.+/),
]);
export type Visibility = z.infer<typeof VisibilitySchema>;

export const CharacterPublicSchema = z.object({
	age: z.string().default(''),
	appearance: z.string().default(''),
	clothing: z.string().default(''),
	gender: z.string().default(''),
	personality: z.array(z.string()).default([]),
	reputation: z.string().default(''),
	species: z.string().default('human'),
	speechStyle: z.string().default(''),
	voiceNotes: z.string().default(''),
});

export const CharacterPrivateSchema = z.object({
	fears: z.array(z.string()).default([]),
	hiddenEmotionalState: z.string().default(''),
	moralLimits: z.string().default(''),
	privateKnowledge: z.array(z.string()).default([]),
	trueMotives: z.string().default(''),
});

export const RelationshipEdgeSchema = z.object({
	charId: z.string(),
	emotion: z.string().default(''),
	history: z.string().default(''),
	privateAttitude: z.string().default(''),
	publicAttitude: z.string().default(''),
	sourceMemoryId: z.string().optional(),
	trustLevel: z.number().min(0).max(10).default(5),
	visibility: VisibilitySchema.default('public'),
});
export type RelationshipEdge = z.infer<typeof RelationshipEdgeSchema>;

export const CharacterIdentitySchema = z.object({
	abilities: z.array(z.string()).default([]),
	appearance: z.string().default(''),
	conditions: z.string().default(''),
	id: z.string(),
	knownBy: z.array(z.string()).default([]),
	name: z.string(),
	notes: z.string().default(''),
	selfAware: z.boolean().default(true),
});
export type CharacterIdentity = z.infer<typeof CharacterIdentitySchema>;

export const CharacterSchema = z.object({
	createdAt: z.string(),
	genesisMemoryId: z.string().optional(),
	groupIds: z.array(z.string()).default([]),
	id: z.string(),
	identities: z.array(CharacterIdentitySchema).default([]),
	isNarrator: z.boolean().default(false),
	isUserPersona: z.boolean().default(false),
	linkedCharacterIds: z.array(z.string()).default([]),
	locationRelationships: z.array(LocationRelationshipSchema).default([]),
	modelOverride: z.string().default(''),
	name: z.string().min(1),
	private: CharacterPrivateSchema.default({}),
	public: CharacterPublicSchema.default({}),
	relationships: z.array(RelationshipEdgeSchema).default([]),
	role: z.string().default(''),
	storyId: z.string(),
	updatedAt: z.string(),
});
export type Character = z.infer<typeof CharacterSchema>;

export const CharacterCreateSchema = CharacterSchema.omit({
	createdAt: true,
	id: true,
	updatedAt: true,
}).partial({
	groupIds: true,
	identities: true,
	isNarrator: true,
	isUserPersona: true,
	linkedCharacterIds: true,
	locationRelationships: true,
	modelOverride: true,
	private: true,
	public: true,
	relationships: true,
	role: true,
	storyId: true,
});
export type CharacterCreate = z.infer<typeof CharacterCreateSchema>;

export const CharacterUpdateSchema = CharacterCreateSchema.partial();
export type CharacterUpdate = z.infer<typeof CharacterUpdateSchema>;
