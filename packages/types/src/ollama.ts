import { z } from 'zod';

export const OllamaMessageSchema = z.object({
	content: z.string(),
	role: z.enum(['system', 'user', 'assistant']),
});
export type OllamaMessage = z.infer<typeof OllamaMessageSchema>;

export const OllamaStreamChunkSchema = z.object({
	created_at: z.string(),
	done: z.boolean(),
	done_reason: z.string().optional(),
	eval_count: z.number().optional(),
	message: z.object({
		content: z.string(),
		role: z.literal('assistant'),
	}),
	model: z.string(),
	prompt_eval_count: z.number().optional(),
	total_duration: z.number().optional(),
});
export type OllamaStreamChunk = z.infer<typeof OllamaStreamChunkSchema>;

export const OllamaModelSchema = z.object({
	digest: z.string(),
	model: z.string(),
	modified_at: z.string(),
	name: z.string(),
	size: z.number(),
});
export type OllamaModel = z.infer<typeof OllamaModelSchema>;
