import type { DmProposal } from '@simplechat/types';
import type { PipelineEvent, ContextSnapshot } from './debug-types.js';

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
				const msg = JSON.parse(line) as {
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
