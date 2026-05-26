import type { z } from 'zod';

export interface Tool<TInput, TOutput> {
	name: string;
	description: string; // this goes in the LLM's prompt
	schema: z.ZodType<TInput>;
	execute(input: TInput): Promise<TOutput>;
}
