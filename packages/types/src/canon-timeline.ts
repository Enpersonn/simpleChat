import { z } from 'zod'

export const CanonEntrySchema = z.object({
  id: z.string(),
  characterId: z.string(),
  memoryId: z.string(),
  label: z.string().optional(),
})
export type CanonEntry = z.infer<typeof CanonEntrySchema>

export const CanonEntryCreateSchema = CanonEntrySchema.omit({ id: true })
export type CanonEntryCreate = z.infer<typeof CanonEntryCreateSchema>

export const CanonTimelineSchema = z.object({
  storyId: z.string(),
  entries: z.array(CanonEntrySchema).default([]),
})
export type CanonTimeline = z.infer<typeof CanonTimelineSchema>
