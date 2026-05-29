import type { DmProposal } from '@simplechat/types';
import type { ContextSnapshot, PipelineEvent } from './debug-types.js';

export interface ParseProgressFrame {
	stage: string;
	status: 'start' | 'complete' | 'error';
	data?: {
		count?: number;
		characterName?: string;
		characterCount?: number;
		locationCount?: number;
		storyCore?: unknown;
		locations?: unknown;
		characters?: unknown;
		memories?: unknown;
	};
}

export interface ParsePartialFrame {
	type: 'storyCore' | 'locations' | 'characters' | 'memories';
	data: unknown;
}

export interface ParseVerboseEvent {
	agent: string;
	step: 'request' | 'response';
	chunkIndex?: number;
	totalChunks?: number;
	prompt?: string;
	rawText?: string;
	durationMs?: number;
}

export interface ParseImportOptions {
	text: string;
	context?: Record<string, unknown>;
	onProgress: (frame: ParseProgressFrame) => void;
	onPartial: (frame: ParsePartialFrame) => void;
	onVerbose?: (event: ParseVerboseEvent) => void;
	onDone: (result: unknown) => void;
	onError: (msg: string) => void;
	signal?: AbortSignal;
}

export interface DebugInfo {
	systemPrompt: string;
	model: string;
}

export interface StateUpdate {
	activeHooks?: string[];
	canonFactsCreated?: number;
	currentLocationId: string | null;
	locationChanged?: boolean;
	locationName: string | null | undefined;
	narrativePressure?: number;
	newLocationCreated?: boolean;
	volatileStateUpdates?: Record<
		string,
		{ emotionalColor: string; focus: string; stress: number }
	>;
}

export interface StreamOptions {
	storyId: string;
	chatId: string;
	body: object;
	onChunk: (text: string) => void;
	onDone: () => void;
	onError: (msg: string) => void;
	onDebug?: (info: DebugInfo) => void;
	onStateUpdate?: (update: StateUpdate) => void;
	onPipelineEvent?: (event: PipelineEvent) => void;
	onContextSnapshot?: (snapshot: ContextSnapshot) => void;
	onProposals?: (proposals: DmProposal[]) => void;
	onToolCall?: (call: { name: string; args: unknown }) => void;
	onToolResult?: (result: { name: string; output: unknown }) => void;
	signal?: AbortSignal;
}

export interface PlanStreamOptions {
	storyId: string;
	chatId: string;
	text: string;
	model?: string;
	onChunk: (text: string) => void;
	onDone: () => void;
	onError: (msg: string) => void;
	onProposals?: (proposals: DmProposal[]) => void;
	onPipelineEvent?: (event: PipelineEvent) => void;
	onToolCall?: (call: { name: string; args: unknown }) => void;
	onToolResult?: (result: { name: string; output: unknown }) => void;
	signal?: AbortSignal;
}

type UnifiedStreamEvent =
	| { type: 'content'; text: string }
	| {
			type: 'progress';
			channel?: string;
			name: string;
			status?: 'start' | 'complete' | 'error';
			data?: unknown;
	  }
	| { type: 'debug'; name: string; data: unknown }
	| { type: 'tool_call'; name: string; args: unknown }
	| { type: 'tool_result'; name: string; output: unknown }
	| { type: 'skill_call'; name: string; args: unknown }
	| { type: 'skill_result'; name: string; output: unknown }
	| { type: 'handoff'; from: string; to: string; message: string }
	| { type: 'error'; message: string }
	| { type: 'done'; result?: unknown };

type LegacyParseMessage = {
	parseProgress?: ParseProgressFrame;
	parsePartial?: ParsePartialFrame;
	parseVerbose?: ParseVerboseEvent;
	done?: boolean;
	result?: unknown;
	error?: string;
};

type LegacyStreamMessage = {
	content?: string;
	done?: boolean;
	error?: string;
	debug?: DebugInfo;
	stateUpdate?: StateUpdate;
	pipelineEvent?: PipelineEvent;
	contextSnapshot?: ContextSnapshot;
	proposals?: DmProposal[];
	toolCall?: { name: string; args: unknown };
	toolResult?: { name: string; output: unknown };
};

function isUnifiedEnvelope(
	msg: unknown,
): msg is { event: UnifiedStreamEvent } {
	return (
		!!msg &&
		typeof msg === 'object' &&
		'event' in msg &&
		!!(msg as { event?: unknown }).event
	);
}

function handleUnifiedParseEvent(
	event: UnifiedStreamEvent,
	handlers: {
		onDone: (result: unknown) => void;
		onError: (msg: string) => void;
		onPartial: (frame: ParsePartialFrame) => void;
		onProgress: (frame: ParseProgressFrame) => void;
		onVerbose?: (event: ParseVerboseEvent) => void;
	},
): boolean {
	if (event.type === 'error') {
		handlers.onError(event.message);
		return true;
	}

	if (event.type === 'progress' && event.channel === 'parse_stage') {
		handlers.onProgress(event.data as ParseProgressFrame);
		return false;
	}

	if (event.type === 'progress' && event.channel === 'parse_partial') {
		handlers.onPartial(event.data as ParsePartialFrame);
		return false;
	}

	if (event.type === 'debug' && event.name === 'parse_verbose') {
		handlers.onVerbose?.(event.data as ParseVerboseEvent);
		return false;
	}

	if (event.type === 'done') {
		handlers.onDone(event.result);
		return true;
	}

	return false;
}

function handleUnifiedStreamEvent(
	event: UnifiedStreamEvent,
	handlers: {
		onChunk: (text: string) => void;
		onDone: () => void;
		onError: (msg: string) => void;
		onDebug?: (info: DebugInfo) => void;
		onStateUpdate?: (update: StateUpdate) => void;
		onPipelineEvent?: (event: PipelineEvent) => void;
		onContextSnapshot?: (snapshot: ContextSnapshot) => void;
		onProposals?: (proposals: DmProposal[]) => void;
		onToolCall?: (call: { name: string; args: unknown }) => void;
		onToolResult?: (result: { name: string; output: unknown }) => void;
	},
): boolean {
	switch (event.type) {
		case 'content':
			handlers.onChunk(event.text);
			return false;
		case 'progress':
			if (event.channel === 'pipeline') {
				handlers.onPipelineEvent?.(event.data as PipelineEvent);
				return false;
			}
			if (event.channel === 'state_update') {
				handlers.onStateUpdate?.(event.data as StateUpdate);
				return false;
			}
			if (event.channel === 'proposals') {
				handlers.onProposals?.(event.data as DmProposal[]);
			}
			return false;
		case 'debug':
			if (event.name === 'llm') {
				handlers.onDebug?.(event.data as DebugInfo);
				return false;
			}
			if (event.name === 'context_snapshot') {
				handlers.onContextSnapshot?.(
					event.data as ContextSnapshot,
				);
			}
			return false;
		case 'tool_call':
			handlers.onToolCall?.({ args: event.args, name: event.name });
			return false;
		case 'tool_result':
			handlers.onToolResult?.({
				name: event.name,
				output: event.output,
			});
			return false;
		case 'error':
			handlers.onError(event.message);
			return true;
		case 'done':
			handlers.onDone();
			return true;
		default:
			return false;
	}
}

export async function parseImportStream(
	opts: ParseImportOptions,
): Promise<void> {
	const {
		text,
		context,
		onProgress,
		onPartial,
		onVerbose,
		onDone,
		onError,
		signal,
	} = opts;

	let res: Response;
	try {
		res = await fetch('/ai/parse-stream', {
			body: JSON.stringify({ context, text }),
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
			signal,
		});
	} catch (err) {
		if ((err as Error).name === 'AbortError') return;
		onError((err as Error).message);
		return;
	}

	if (!res.ok || !res.body) {
		onError(`Request failed: ${res.status}`);
		return;
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	while (true) {
		let done: boolean;
		let value: Uint8Array | undefined;
		try {
			({ done, value } = await reader.read());
		} catch {
			break;
		}
		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';

		for (const line of lines) {
			if (!line.trim()) continue;
			try {
				const msg = JSON.parse(line) as
					| { event: UnifiedStreamEvent }
					| LegacyParseMessage;
				if (isUnifiedEnvelope(msg)) {
					const handled = handleUnifiedParseEvent(msg.event, {
						onDone,
						onError,
						onPartial,
						onProgress,
						onVerbose,
					});
					if (handled) return;
					continue;
				}
				if (msg.error) {
					onError(msg.error);
					return;
				}
				if (msg.parseProgress) {
					onProgress(msg.parseProgress);
					continue;
				}
				if (msg.parsePartial) {
					onPartial(msg.parsePartial);
					continue;
				}
				if (msg.parseVerbose) {
					onVerbose?.(msg.parseVerbose);
					continue;
				}
				if (msg.done) {
					onDone(msg.result);
					return;
				}
			} catch {
				// skip malformed line
			}
		}
	}
	onDone(undefined);
}

async function readStream(
	res: Response,
	onChunk: (text: string) => void,
	onDone: () => void,
	onError: (msg: string) => void,
	onDebug?: (info: DebugInfo) => void,
	onStateUpdate?: (update: StateUpdate) => void,
	onPipelineEvent?: (event: PipelineEvent) => void,
	onContextSnapshot?: (snapshot: ContextSnapshot) => void,
	onProposals?: (proposals: DmProposal[]) => void,
	onToolCall?: (call: { name: string; args: unknown }) => void,
	onToolResult?: (result: { name: string; output: unknown }) => void,
): Promise<void> {
	if (!res.body) {
		onError(`Request failed: ${res.status}`);
		return;
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	while (true) {
		let done: boolean;
		let value: Uint8Array | undefined;
		try {
			({ done, value } = await reader.read());
		} catch {
			break;
		}
		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';

		for (const line of lines) {
			if (!line.trim()) continue;
			try {
				const msg = JSON.parse(line) as
					| { event: UnifiedStreamEvent }
					| LegacyStreamMessage;
				if (isUnifiedEnvelope(msg)) {
					const handled = handleUnifiedStreamEvent(msg.event, {
						onChunk,
						onDone,
						onError,
						onDebug,
						onStateUpdate,
						onPipelineEvent,
						onContextSnapshot,
						onProposals,
						onToolCall,
						onToolResult,
					});
					if (handled) return;
					continue;
				}
				if (msg.pipelineEvent) {
					onPipelineEvent?.(msg.pipelineEvent);
					continue;
				}
				if (msg.contextSnapshot) {
					onContextSnapshot?.(msg.contextSnapshot);
					continue;
				}
				if (msg.debug) {
					onDebug?.(msg.debug);
					continue;
				}
				if (msg.stateUpdate) {
					onStateUpdate?.(msg.stateUpdate);
					continue;
				}
				if (msg.proposals) {
					onProposals?.(msg.proposals);
					continue;
				}
				if (msg.toolCall) {
					onToolCall?.(msg.toolCall);
					continue;
				}
				if (msg.toolResult) {
					onToolResult?.(msg.toolResult);
					continue;
				}
				if (msg.error) {
					onError(msg.error);
					return;
				}
				if (msg.content) onChunk(msg.content);
				if (msg.done) {
					onDone();
					return;
				}
			} catch {
				// skip malformed line
			}
		}
	}
	onDone();
}

export async function sendMessageStream(opts: StreamOptions): Promise<void> {
	const { body, chatId, onChunk, onDone, onError, onDebug, signal, storyId } =
		opts;

	let res: Response;
	try {
		res = await fetch(`/stories/${storyId}/chats/${chatId}/message`, {
			body: JSON.stringify(body),
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
			signal,
		});
	} catch (err) {
		if ((err as Error).name === 'AbortError') return;
		onError((err as Error).message);
		return;
	}

	if (!res.ok || !res.body) {
		onError(`Request failed: ${res.status}`);
		return;
	}
	await readStream(
		res,
		onChunk,
		onDone,
		onError,
		onDebug,
		opts.onStateUpdate,
		opts.onPipelineEvent,
		opts.onContextSnapshot,
		opts.onProposals,
		opts.onToolCall,
		opts.onToolResult,
	);
}

export async function openerStream(
	storyId: string,
	chatId: string,
	handlers: Pick<
		StreamOptions,
		| 'onChunk'
		| 'onDone'
		| 'onError'
		| 'onDebug'
		| 'onPipelineEvent'
		| 'onContextSnapshot'
		| 'onToolCall'
		| 'onToolResult'
		| 'signal'
	>,
): Promise<void> {
	let res: Response;
	try {
		res = await fetch(`/stories/${storyId}/chats/${chatId}/opener`, {
			body: JSON.stringify({}),
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
			signal: handlers.signal,
		});
	} catch (err) {
		if ((err as Error).name === 'AbortError') return;
		handlers.onError((err as Error).message);
		return;
	}
	if (!res.ok || !res.body) {
		handlers.onError(`Request failed: ${res.status}`);
		return;
	}
	await readStream(
		res,
		handlers.onChunk,
		handlers.onDone,
		handlers.onError,
		handlers.onDebug,
		undefined,
		handlers.onPipelineEvent,
		handlers.onContextSnapshot,
		undefined,
		handlers.onToolCall,
		handlers.onToolResult,
	);
}

export async function regenerateStream(opts: StreamOptions): Promise<void> {
	const { body, chatId, onChunk, onDone, onError, onDebug, signal, storyId } =
		opts;

	let res: Response;
	try {
		res = await fetch(`/stories/${storyId}/chats/${chatId}/regenerate`, {
			body: JSON.stringify(body),
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
			signal,
		});
	} catch (err) {
		if ((err as Error).name === 'AbortError') return;
		onError((err as Error).message);
		return;
	}

	if (!res.ok || !res.body) {
		onError(`Request failed: ${res.status}`);
		return;
	}
	await readStream(
		res,
		onChunk,
		onDone,
		onError,
		onDebug,
		opts.onStateUpdate,
		opts.onPipelineEvent,
		opts.onContextSnapshot,
		opts.onProposals,
		opts.onToolCall,
		opts.onToolResult,
	);
}

export async function planMessageStream(
	opts: PlanStreamOptions,
): Promise<void> {
	const {
		chatId,
		model,
		onChunk,
		onDone,
		onError,
		onProposals,
		signal,
		storyId,
		text,
	} = opts;

	let res: Response;
	try {
		res = await fetch(`/stories/${storyId}/chats/${chatId}/plan-message`, {
			body: JSON.stringify({ model, text }),
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
			signal,
		});
	} catch (err) {
		if ((err as Error).name === 'AbortError') return;
		onError((err as Error).message);
		return;
	}

	if (!res.ok || !res.body) {
		onError(`Request failed: ${res.status}`);
		return;
	}
	await readStream(
		res,
		onChunk,
		onDone,
		onError,
		undefined,
		undefined,
		opts.onPipelineEvent,
		undefined,
		onProposals,
		opts.onToolCall,
		opts.onToolResult,
	);
}
