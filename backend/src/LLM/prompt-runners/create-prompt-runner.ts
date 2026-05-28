import { z } from 'zod';
import { extractJson } from '../../utils.js';
import { getOllamaAdapter } from '../llm-client.js';

export interface PromptRunnerVerboseEvent {
	step: 'request' | 'response';
	prompt?: string;
	rawText?: string;
	durationMs?: number;
}

export const createPromptRunner = <T extends z.ZodType<any>>(config: {
	role: string;
	instructions: string;
	outputSchema: T;
	temperature: number;
	num_ctx?: number;
}) => {
	const schemaHint = JSON.stringify(z.toJSONSchema(config.outputSchema), null, 2);
	const systemPrompt = `You are a ${config.role}. ${config.instructions}\n\nOutput ONLY a valid JSON object matching this schema:\n${schemaHint}`;

	const run = async (
		userContent: string,
		overrides?: {
			num_ctx?: number;
			onVerbose?: (event: PromptRunnerVerboseEvent) => void;
			temperature?: number;
		},
	): Promise<z.infer<T>> => {
		overrides?.onVerbose?.({ prompt: userContent, step: 'request' });
		const startTime = Date.now();
		const adapter = await getOllamaAdapter(
			overrides?.num_ctx ?? config.num_ctx,
		);
		const { text } = await adapter.chat({
			messages: [
				{ content: systemPrompt, role: 'system' as const },
				{ content: userContent, role: 'user' as const },
			],
			temperature: overrides?.temperature ?? config.temperature,
		});
		overrides?.onVerbose?.({
			durationMs: Date.now() - startTime,
			rawText: text,
			step: 'response',
		});
		return extractJson(text) as z.infer<T>;
	};

	return { run };
};

export type PromptRunner = {
	run: (
		content: string,
		overrides?: {
			num_ctx?: number;
			onVerbose?: (event: PromptRunnerVerboseEvent) => void;
			temperature?: number;
		},
	) => Promise<Record<string, unknown>>;
};
