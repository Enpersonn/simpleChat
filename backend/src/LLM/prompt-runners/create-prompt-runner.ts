import { z } from 'zod';
import { getOllamaAdapter } from '../llm-client.js';

export const createPromptRunner = <T extends z.ZodType<any>>(config: {
	role: string;
	instructions: string;
	outputSchema: T;
	temperature: number;
	num_ctx?: number;
}) => {
	const systemPrompt = `You are a ${config.role}. ${config.instructions}`;

	const run = async (
		userContent: string,
		overrides?: { temperature?: number; num_ctx?: number },
	): Promise<z.infer<T>> => {
		const adapter = await getOllamaAdapter(overrides?.num_ctx ?? config.num_ctx);
		const { json } = await adapter.json({
			messages: [
				{ role: 'system' as const, content: systemPrompt },
				{ role: 'user' as const, content: userContent },
			],
			schema: config.outputSchema,
			temperature: overrides?.temperature ?? config.temperature,
		});
		return json as z.infer<T>;
	};

	return { run };
};

export type PromptRunner = {
	run: (
		content: string,
		overrides?: { temperature?: number; num_ctx?: number },
	) => Promise<Record<string, unknown>>;
};
