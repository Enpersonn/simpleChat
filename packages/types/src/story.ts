import { z } from 'zod'

export const WritingStyleSchema = z.object({
  prose: z.string().default(''),
  interiority: z.string().default(''),
  dialogue: z.string().default(''),
  pacing: z.string().default(''),
  sensory: z.string().default(''),
})
export type WritingStyle = z.infer<typeof WritingStyleSchema>

export const StoryRulesSchema = z.object({
  worldRules: z.array(z.string()).default([]),
  storyRules: z.array(z.string()).default([]),
  characterRules: z.array(z.string()).default([]),
})
export type StoryRules = z.infer<typeof StoryRulesSchema>

export const StorySchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  premise: z.string().default(''),
  genres: z.array(z.string()).default([]),
  tone: z.array(z.string()).default([]),
  themes: z.array(z.string()).default([]),
  rules: StoryRulesSchema.default({}),
  writingStyle: WritingStyleSchema.default({}),
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
  themes: true,
  rules: true,
  writingStyle: true,
  systemPromptOverride: true,
  openingMessage: true,
  pov: true,
})
export type StoryCreate = z.infer<typeof StoryCreateSchema>

export const StoryUpdateSchema = StoryCreateSchema.partial()
export type StoryUpdate = z.infer<typeof StoryUpdateSchema>
