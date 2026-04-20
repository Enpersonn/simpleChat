import { z } from 'zod'

export const OllamaMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
})
export type OllamaMessage = z.infer<typeof OllamaMessageSchema>

export const OllamaStreamChunkSchema = z.object({
  model: z.string(),
  created_at: z.string(),
  message: z.object({
    role: z.literal('assistant'),
    content: z.string(),
  }),
  done: z.boolean(),
  done_reason: z.string().optional(),
  total_duration: z.number().optional(),
  prompt_eval_count: z.number().optional(),
  eval_count: z.number().optional(),
})
export type OllamaStreamChunk = z.infer<typeof OllamaStreamChunkSchema>

export const OllamaModelSchema = z.object({
  name: z.string(),
  model: z.string(),
  modified_at: z.string(),
  size: z.number(),
  digest: z.string(),
})
export type OllamaModel = z.infer<typeof OllamaModelSchema>
