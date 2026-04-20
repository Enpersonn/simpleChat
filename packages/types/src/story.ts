import { z } from 'zod'

export const StorySchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  premise: z.string().default(''),
  genres: z.array(z.string()).default([]),
  tone: z.array(z.string()).default([]),
  rules: z.array(z.string()).default([]),
  writingStyle: z.string().default(''),
  systemPromptOverride: z.string().default(''),
  openingMessage: z.string().default(''),
  pov: z
    .enum(['first-person', 'third-person-limited', 'third-person-omniscient'])
    .default('third-person-limited'),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Story = z.infer<typeof StorySchema>

export const StoryCreateSchema = StorySchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).partial({
  premise: true,
  genres: true,
  tone: true,
  rules: true,
  writingStyle: true,
  systemPromptOverride: true,
  pov: true,
})
export type StoryCreate = z.infer<typeof StoryCreateSchema>

export const StoryUpdateSchema = StoryCreateSchema.partial()
export type StoryUpdate = z.infer<typeof StoryUpdateSchema>
