import { z } from 'zod';
import { createOllamaRuntime } from '../runtime.js';
import type { ParseTraceEmitter } from '../parsing/trace-types.js';

export interface PromptRunnerVerboseEvent {
	step: 'request' | 'response';
	attempt?: number;
	prompt?: string;
	rawText?: string;
	durationMs?: number;
}

function isAbortError(error: unknown): boolean {
	return error instanceof DOMException
		? error.name === 'AbortError'
		: error instanceof Error
			? error.name === 'AbortError'
			: false;
}

function buildSignal(
	signal: AbortSignal | undefined,
	timeoutMs: number | undefined,
): AbortSignal | undefined {
	if (timeoutMs === undefined) return signal;
	const timeoutSignal = AbortSignal.timeout(timeoutMs);
	if (!signal) return timeoutSignal;
	return AbortSignal.any([signal, timeoutSignal]);
}

function summariseJson(value: unknown): string {
	try {
		const text = JSON.stringify(value);
		return text.length > 1200 ? `${text.slice(0, 1200)}…` : text;
	} catch {
		return '[unserializable]';
	}
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
			retryCount?: number;
			signal?: AbortSignal;
			temperature?: number;
			timeoutMs?: number;
			trace?: ParseTraceEmitter;
			traceAgent?: string;
			traceScope?: string;
			traceStage?: string | null;
		},
	): Promise<z.infer<T>> => {
		const retryCount = overrides?.retryCount ?? 0;
		const trace = overrides?.trace;
		const traceStage = overrides?.traceStage ?? null;
		const traceScope = overrides?.traceScope ?? config.role;
		const traceAgent = overrides?.traceAgent ?? config.role;
		const numCtx = overrides?.num_ctx ?? config.num_ctx;
		const temperature = overrides?.temperature ?? config.temperature;
		const runtime = await createOllamaRuntime({
			numCtx,
		});

		for (let attempt = 1; attempt <= retryCount + 1; attempt++) {
			const startTime = Date.now();
			const signal = buildSignal(
				overrides?.signal,
				overrides?.timeoutMs,
			);

			overrides?.onVerbose?.({
				attempt,
				prompt: userContent,
				step: 'request',
			});
			await trace?.emit({
				kind: 'llm_request',
				payload: {
					agent: traceAgent,
					attempt,
					model: runtime.defaultModel,
					numCtx: numCtx ?? null,
					prompt: userContent,
					schemaName: config.role,
					scope: traceScope,
					temperature,
				},
				stage: traceStage,
			});

			try {
				const response = await runtime.json({
					messages: [
						{ content: systemPrompt, role: 'system' as const },
						{ content: userContent, role: 'user' as const },
					],
					schema: config.outputSchema,
					signal,
					temperature,
				});
				const durationMs = Date.now() - startTime;
				overrides?.onVerbose?.({
					attempt,
					durationMs,
					rawText: response.text,
					step: 'response',
				});
				await trace?.emit({
					kind: 'llm_response',
					payload: {
						agent: traceAgent,
						attempt,
						durationMs,
						parsedSummary: summariseJson(response.json),
						rawText: response.text,
						scope: traceScope,
						usage: response.usage ?? null,
					},
					stage: traceStage,
				});
				return response.json;
			} catch (error) {
				if (isAbortError(error)) throw error;
				const message =
					error instanceof Error ? error.message : String(error);
				await trace?.emit({
					kind: 'warning',
					payload: {
						agent: traceAgent,
						attempt,
						message,
						scope: traceScope,
					},
					stage: traceStage,
				});
				if (attempt <= retryCount) {
					await trace?.emit({
						kind: 'llm_retry',
						payload: {
							agent: traceAgent,
							attempt,
							message,
							scope: traceScope,
						},
						stage: traceStage,
					});
					continue;
				}
				throw error;
			}
		}

		throw new Error('Prompt runner exhausted all retries');
	};

	return { run };
};

export type PromptRunner = {
	run: (
		content: string,
		overrides?: {
			num_ctx?: number;
			onVerbose?: (event: PromptRunnerVerboseEvent) => void;
			retryCount?: number;
			signal?: AbortSignal;
			temperature?: number;
			timeoutMs?: number;
			trace?: ParseTraceEmitter;
			traceAgent?: string;
			traceScope?: string;
			traceStage?: string | null;
		},
	) => Promise<Record<string, unknown>>;
};
