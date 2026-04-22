import { z } from 'zod'

export const LocationRelationshipSchema = z.object({
  locationId: z.string(),
  comfort: z.number().min(0).max(10).default(5),
  tension: z.number().min(0).max(10).default(0),
  emotion: z.string().default(''),
  notes: z.string().default(''),
  sourceMemoryId: z.string().optional(),
})
export type LocationRelationship = z.infer<typeof LocationRelationshipSchema>

export const VisibilitySchema = z.union([
  z.literal('public'),
  z.literal('narrator-only'),
  z.string().regex(/^party:.+/),
  z.string().regex(/^character:.+/),
])
export type Visibility = z.infer<typeof VisibilitySchema>

export const CharacterPublicSchema = z.object({
  appearance: z.string().default(''),
  personality: z.array(z.string()).default([]),
  speechStyle: z.string().default(''),
  reputation: z.string().default(''),
  voiceNotes: z.string().default(''),
  age: z.string().default(''),
  gender: z.string().default(''),
  species: z.string().default('human'),
  clothing: z.string().default(''),
})

export const CharacterPrivateSchema = z.object({
  trueMotives: z.string().default(''),
  fears: z.array(z.string()).default([]),
  privateKnowledge: z.array(z.string()).default([]),
  moralLimits: z.string().default(''),
  hiddenEmotionalState: z.string().default(''),
})

export const RelationshipEdgeSchema = z.object({
  charId: z.string(),
  publicAttitude: z.string().default(''),
  privateAttitude: z.string().default(''),
  history: z.string().default(''),
  trustLevel: z.number().min(0).max(10).default(5),
  visibility: VisibilitySchema.default('public'),
  emotion: z.string().default(''),
  sourceMemoryId: z.string().optional(),
})
export type RelationshipEdge = z.infer<typeof RelationshipEdgeSchema>

export const CharacterSchema = z.object({
  id: z.string(),
  storyId: z.string(),
  name: z.string().min(1),
  role: z.string().default(''),
  isUserPersona: z.boolean().default(false),
  isNarrator: z.boolean().default(false),
  modelOverride: z.string().default(''),
  groupIds: z.array(z.string()).default([]),
  public: CharacterPublicSchema.default({}),
  private: CharacterPrivateSchema.default({}),
  relationships: z.array(RelationshipEdgeSchema).default([]),
  locationRelationships: z.array(LocationRelationshipSchema).default([]),
  genesisMemoryId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Character = z.infer<typeof CharacterSchema>

export const CharacterCreateSchema = CharacterSchema.omit({
  id: true,
  storyId: true,
  createdAt: true,
  updatedAt: true,
}).partial({
  role: true,
  isUserPersona: true,
  isNarrator: true,
  modelOverride: true,
  groupIds: true,
  public: true,
  private: true,
  relationships: true,
  locationRelationships: true,
})
export type CharacterCreate = z.infer<typeof CharacterCreateSchema>

export const CharacterUpdateSchema = CharacterCreateSchema.partial()
export type CharacterUpdate = z.infer<typeof CharacterUpdateSchema>
