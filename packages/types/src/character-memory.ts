import { z } from 'zod'

export const CharacterDeltaSchema = z.object({
  personality: z
    .object({
      add: z.array(z.string()).default([]),
      remove: z.array(z.string()).default([]),
    })
    .optional(),
  fears: z
    .object({
      add: z.array(z.string()).default([]),
      remove: z.array(z.string()).default([]),
    })
    .optional(),
  privateKnowledge: z
    .object({
      add: z.array(z.string()).default([]),
      remove: z.array(z.string()).default([]),
    })
    .optional(),
  speechStyle: z.string().optional(),
  trueMotives: z.string().optional(),
  hiddenEmotionalState: z.string().optional(),
  moralLimits: z.string().optional(),
  appearance: z.string().optional(),
  clothing: z.string().optional(),
  reputation: z.string().optional(),
  relationships: z.array(z.object({
    charId: z.string(),
    emotion: z.string().optional(),
    publicAttitude: z.string().optional(),
    privateAttitude: z.string().optional(),
    trustLevel: z.number().min(0).max(10).optional(),
  })).optional(),
})
export type CharacterDelta = z.infer<typeof CharacterDeltaSchema>

export const CharacterMemorySchema = z.object({
  id: z.string(),
  storyId: z.string(),
  characterId: z.string(),
  summary: z.string().min(1),
  tags: z.array(z.string()).default([]),
  importance: z.number().min(0).max(1).default(0.5),
  sourceChatId: z.string().optional(),
  sourceTurnId: z.string().optional(),
  previousMemoryId: z.string().optional(),
  branchLabel: z.string().optional(),
  deltas: CharacterDeltaSchema.optional(),
  createdAt: z.string(),
})
export type CharacterMemory = z.infer<typeof CharacterMemorySchema>

export const CharacterMemoryCreateSchema = CharacterMemorySchema.omit({
  id: true,
  storyId: true,
  characterId: true,
  createdAt: true,
}).partial({
  tags: true,
  importance: true,
  sourceChatId: true,
  sourceTurnId: true,
  previousMemoryId: true,
  branchLabel: true,
  deltas: true,
})
export type CharacterMemoryCreate = z.infer<typeof CharacterMemoryCreateSchema>

export const CharacterMemoryUpdateSchema = CharacterMemoryCreateSchema.partial()
export type CharacterMemoryUpdate = z.infer<typeof CharacterMemoryUpdateSchema>
