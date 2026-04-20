import { z } from 'zod'
import { VisibilitySchema } from './character.js'

export const MemoryItemSchema = z.object({
  id: z.string(),
  storyId: z.string(),
  chatId: z.string(),
  sourceTurnId: z.string().optional(),
  content: z.string(),
  visibility: VisibilitySchema.default('public'),
  tags: z.array(z.string()).default([]),
  importance: z.number().min(0).max(1).default(0.5),
  revealed: z.boolean().default(false),
  revealedAt: z.string().optional(),
  revealedTo: z.string().optional(),
  timestamp: z.string(),
})
export type MemoryItem = z.infer<typeof MemoryItemSchema>

export const MemoryItemCreateSchema = MemoryItemSchema.omit({
  id: true,
  storyId: true,
  chatId: true,
  timestamp: true,
}).partial({
  sourceTurnId: true,
  visibility: true,
  tags: true,
  importance: true,
  revealed: true,
})
export type MemoryItemCreate = z.infer<typeof MemoryItemCreateSchema>
