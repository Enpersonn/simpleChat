import type { ZodSchema } from 'zod';

export interface Tool<TInput, TOutput> {
	name: string;
	description: string; // this goes in the LLM's prompt
	schema: ZodSchema<TInput>;
	execute(input: TInput): Promise<TOutput>;
}
