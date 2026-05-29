import {
	createFunctionProvider,
	createToolSystem,
	type FunctionTool,
	type ToolSystem,
} from '@llm-helpers/tools';
import type { ToolBackend, ToolCall, ToolResult } from '@llm-helpers/types';
import type {
	PromptRunner,
	PromptRunnerVerboseEvent,
} from '../prompt-runners/create-prompt-runner.js';
import type { ParseTraceEmitter } from './trace-types.js';
import type { ParseVerboseCallback } from './verbose-types.js';

export interface ParsingMcpPolicy {
	enabled: boolean;
	fallback: 'local-only';
	servers?: string[];
	stageTools: Record<string, string[]>;
	toolSystem?: ToolSystem;
}

export interface ChunkedPassContext {
	mcpPolicy?: ParsingMcpPolicy;
	onVerbose?: ParseVerboseCallback;
	signal?: AbortSignal;
	timeoutMs?: number;
	trace?: ParseTraceEmitter;
}

export interface ReducerSpec<TCandidate, TResult> {
	description: string;
	maxConcurrency?: number;
	run: (
		candidates: TCandidate[],
		context: ChunkedPassContext,
	) => Promise<TResult>;
}

export interface ChunkedPassSpec<TCandidate, TResult = TCandidate[]> {
	candidateReducer?: (
		candidates: TCandidate[],
		context: ChunkedPassContext,
	) => Promise<TCandidate[]> | TCandidate[];
	chunkSelector?:
		| number[]
		| ((
				chunks: string[],
				context: ChunkedPassContext,
		  ) => number[] | Promise<number[]>);
	chunkInput: {
		chunks: string[];
		maxChars?: number;
		overlapChars?: number;
	};
	dedupeBy?: (candidate: TCandidate) => string;
	extractor: PromptRunner;
	maxConcurrency?: number;
	parseChunk: (
		result: Record<string, unknown>,
		chunkIndex: number,
	) => TCandidate[];
	promptScope: string;
	reducer?: ReducerSpec<TCandidate, TResult>;
	retryCount?: number;
	selectionLimit?: number;
	stage: string;
	traceAgent: string;
	neighborSpillover?: number;
	buildPrompt: (chunk: string, chunkIndex: number, total: number) => string;
}

export interface ParsingStageConfig<
	TArgs,
	TResult,
	TContext extends ChunkedPassContext = ChunkedPassContext,
> {
	description: string;
	name: string;
	run: (args: TArgs, context: TContext) => Promise<TResult>;
}

function isAbortError(error: unknown): boolean {
	return error instanceof DOMException
		? error.name === 'AbortError'
		: error instanceof Error
			? error.name === 'AbortError'
			: false;
}

export async function withConcurrencyLimit<T>(
	fns: Array<() => Promise<T>>,
	limit: number,
): Promise<T[]> {
	const results: T[] = new Array(fns.length);
	let next = 0;

	async function worker() {
		while (next < fns.length) {
			const index = next++;
			results[index] = await fns[index]();
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(limit, fns.length) }, worker),
	);
	return results;
}

async function emitChunkEvent(
	trace: ParseTraceEmitter | undefined,
	kind:
		| 'chunk_plan_created'
		| 'chunk_start'
		| 'chunk_complete'
		| 'chunk_error',
	stage: string,
	payload: Record<string, unknown>,
) {
	await trace?.emit({
		kind,
		payload,
		stage,
	});
}

export async function withRetry<T>(
	fn: () => Promise<T>,
	attempts = 2,
): Promise<T | null> {
	for (let index = 0; index < attempts; index++) {
		try {
			return await fn();
		} catch (error) {
			if (isAbortError(error)) throw error;
			if (index === attempts - 1) return null;
		}
	}
	return null;
}

async function emitConsolidationEvent(
	trace: ParseTraceEmitter | undefined,
	kind:
		| 'consolidation_start'
		| 'consolidation_complete'
		| 'consolidation_error',
	stage: string,
	payload: Record<string, unknown>,
) {
	await trace?.emit({
		kind,
		payload,
		stage,
	});
}

export function dedupeCandidates<TCandidate>(
	candidates: TCandidate[],
	keyFn?: (candidate: TCandidate) => string,
): TCandidate[] {
	if (!keyFn) return candidates;

	const seen = new Set<string>();
	const deduped: TCandidate[] = [];

	for (const candidate of candidates) {
		const key = keyFn(candidate);
		if (seen.has(key)) continue;
		seen.add(key);
		deduped.push(candidate);
	}

	return deduped;
}

function buildVerboseHandler(
	context: ChunkedPassContext,
	traceAgent: string,
	chunkIndex: number,
	totalChunks: number,
) {
	if (!context.onVerbose) return undefined;
	return (event: PromptRunnerVerboseEvent) =>
		context.onVerbose?.({
			agent: traceAgent,
			attempt: event.attempt,
			chunkIndex: chunkIndex + 1,
			durationMs: event.durationMs,
			prompt: event.prompt,
			rawText: event.rawText,
			step: event.step,
			totalChunks,
		});
}

export async function buildStageToolSystem(
	stage: string,
	context: ChunkedPassContext,
	localTools: FunctionTool[] = [],
): Promise<ToolSystem | null> {
	const localProvider = createFunctionProvider(`${stage}-local`, localTools);

	if (!context.mcpPolicy?.enabled || !context.mcpPolicy.toolSystem) {
		await context.trace?.emit({
			kind: 'mcp_stage_skipped',
			payload: {
				reason: 'disabled_or_unconfigured',
				stageTools: [],
			},
			stage,
		});
		return localTools.length > 0
			? createToolSystem({ providers: [localProvider] })
			: null;
	}

	const allowedTools = new Set(context.mcpPolicy.stageTools[stage] ?? []);
	if (allowedTools.size === 0) {
		await context.trace?.emit({
			kind: 'mcp_stage_skipped',
			payload: {
				reason: 'no_stage_tools',
				stageTools: [],
			},
			stage,
		});
		return localTools.length > 0
			? createToolSystem({ providers: [localProvider] })
			: null;
	}

	const mcpToolSystem = context.mcpPolicy.toolSystem;
	const provider: ToolBackend = {
		callTool: async (call: ToolCall, execContext): Promise<ToolResult> => {
			if (!allowedTools.has(call.name)) {
				return {
					content: [],
					error: {
						code: 'TOOL_NOT_FOUND',
						message: `Tool '${call.name}' is not allowed for stage '${stage}'`,
					},
					ok: false,
					toolCallId: call.id,
				};
			}
			return mcpToolSystem.execute(call, execContext);
		},
		id: `${stage}-mcp`,
		listTools: async () => {
			const tools = await mcpToolSystem.listTools();
			return tools
				.filter((tool) => allowedTools.has(tool.name))
				.map(({ providerId: _providerId, ...tool }) => tool);
		},
	};

	await context.trace?.emit({
		kind: 'mcp_stage_enabled',
		payload: {
			stageTools: [...allowedTools],
		},
		stage,
	});

	return createToolSystem({
		providers:
			localTools.length > 0 ? [localProvider, provider] : [provider],
	});
}

export async function runChunkedPass<TCandidate, TResult = TCandidate[]>(
	spec: ChunkedPassSpec<TCandidate, TResult>,
	context: ChunkedPassContext,
): Promise<TResult> {
	const totalChunks = spec.chunkInput.chunks.length;
	const selectedChunkIndices = await resolveChunkSelection(
		spec,
		context,
		totalChunks,
	);
	await emitChunkEvent(context.trace, 'chunk_plan_created', spec.stage, {
		chunkCount: selectedChunkIndices.length,
		maxChars: spec.chunkInput.maxChars ?? null,
		maxConcurrency: spec.maxConcurrency ?? 1,
		overlapChars: spec.chunkInput.overlapChars ?? null,
		promptScope: spec.promptScope,
		selectedChunkIndices: selectedChunkIndices.map((index) => index + 1),
		selectionLimit: spec.selectionLimit ?? null,
		totalChunkCount: totalChunks,
	});

	const tasks = selectedChunkIndices.map((selectedChunkIndex) => async () => {
		const chunk = spec.chunkInput.chunks[selectedChunkIndex];
		const chunkIndex = selectedChunkIndex;
		const prompt = spec.buildPrompt(chunk, chunkIndex, totalChunks);
		const startedAt = Date.now();
		await emitChunkEvent(context.trace, 'chunk_start', spec.stage, {
			chunkIndex: chunkIndex + 1,
			promptLength: prompt.length,
			promptScope: spec.promptScope,
			totalChunks,
		});

		try {
			const result = await spec.extractor.run(prompt, {
				onVerbose: buildVerboseHandler(
					context,
					spec.traceAgent,
					chunkIndex,
					totalChunks,
				),
				retryCount: spec.retryCount ?? 1,
				signal: context.signal,
				timeoutMs: context.timeoutMs,
				trace: context.trace,
				traceAgent: `${spec.traceAgent}:${chunkIndex + 1}`,
				traceScope: spec.promptScope,
				traceStage: spec.stage,
			});
			const candidates = spec.parseChunk(result, chunkIndex);
			await emitChunkEvent(context.trace, 'chunk_complete', spec.stage, {
				candidateCount: candidates.length,
				chunkIndex: chunkIndex + 1,
				durationMs: Date.now() - startedAt,
				promptScope: spec.promptScope,
				totalChunks,
			});
			return candidates;
		} catch (error) {
			if (isAbortError(error)) throw error;
			const message =
				error instanceof Error ? error.message : String(error);
			await emitChunkEvent(context.trace, 'chunk_error', spec.stage, {
				chunkIndex: chunkIndex + 1,
				durationMs: Date.now() - startedAt,
				message,
				promptScope: spec.promptScope,
				totalChunks,
			});
			await context.trace?.emit({
				kind: 'warning',
				payload: {
					chunkIndex: chunkIndex + 1,
					message,
					promptScope: spec.promptScope,
				},
				stage: spec.stage,
			});
			return [] as TCandidate[];
		}
	});

	const chunkResults = await withConcurrencyLimit(
		tasks,
		spec.maxConcurrency ?? 1,
	);
	const flattened = spec.candidateReducer
		? await spec.candidateReducer(chunkResults.flat(), context)
		: chunkResults.flat();
	const deduped = dedupeCandidates(flattened, spec.dedupeBy);

	if (!spec.reducer) {
		return deduped as TResult;
	}

	await emitConsolidationEvent(
		context.trace,
		'consolidation_start',
		spec.stage,
		{
			candidateCountAfterDedupe: deduped.length,
			candidateCountBeforeDedupe: flattened.length,
			description: spec.reducer.description,
		},
	);

	try {
		const result = await spec.reducer.run(deduped, context);
		await emitConsolidationEvent(
			context.trace,
			'consolidation_complete',
			spec.stage,
			{
				candidateCountAfterDedupe: deduped.length,
				candidateCountBeforeDedupe: flattened.length,
				description: spec.reducer.description,
			},
		);
		return result;
	} catch (error) {
		if (isAbortError(error)) throw error;
		await emitConsolidationEvent(
			context.trace,
			'consolidation_error',
			spec.stage,
			{
				description: spec.reducer.description,
				message: error instanceof Error ? error.message : String(error),
			},
		);
		throw error;
	}
}

async function resolveChunkSelection<TCandidate, TResult>(
	spec: ChunkedPassSpec<TCandidate, TResult>,
	context: ChunkedPassContext,
	totalChunks: number,
): Promise<number[]> {
	const chunkIndices =
		typeof spec.chunkSelector === 'function'
			? await spec.chunkSelector(spec.chunkInput.chunks, context)
			: (spec.chunkSelector ??
				spec.chunkInput.chunks.map((_chunk, index) => index));
	const deduped = [...new Set(chunkIndices)]
		.filter(
			(index) =>
				Number.isInteger(index) && index >= 0 && index < totalChunks,
		)
		.sort((left, right) => left - right);
	const limited =
		typeof spec.selectionLimit === 'number' &&
		spec.selectionLimit >= 0 &&
		deduped.length > spec.selectionLimit
			? deduped.slice(0, spec.selectionLimit)
			: deduped;
	if (!spec.neighborSpillover || spec.neighborSpillover <= 0) {
		return limited;
	}
	const expanded = new Set<number>();
	for (const chunkIndex of limited) {
		for (
			let cursor = chunkIndex - spec.neighborSpillover;
			cursor <= chunkIndex + spec.neighborSpillover;
			cursor += 1
		) {
			if (cursor < 0 || cursor >= totalChunks) continue;
			expanded.add(cursor);
		}
	}
	return [...expanded].sort((left, right) => left - right);
}
