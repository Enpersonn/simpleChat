import type { ImportJobEvent } from '@simplechat/types';

export interface TailImportJobOptions {
	afterSeq?: number;
	jobId: string;
	onClose?: () => void;
	onError: (message: string) => void;
	onEvent: (event: ImportJobEvent) => void;
	signal?: AbortSignal;
}

export async function tailImportJobEvents(
	opts: TailImportJobOptions,
): Promise<void> {
	const { afterSeq = 0, jobId, onClose, onError, onEvent, signal } = opts;

	let res: Response;
	try {
		res = await fetch(
			`/ai/import-jobs/${jobId}/events?after=${encodeURIComponent(String(afterSeq))}`,
			{
				method: 'GET',
				signal,
			},
		);
	} catch (error) {
		if ((error as Error).name === 'AbortError') return;
		onError((error as Error).message);
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
		} catch (error) {
			if ((error as Error).name !== 'AbortError') {
				onError((error as Error).message);
			}
			break;
		}

		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';

		for (const line of lines) {
			if (!line.trim()) continue;
			try {
				const event = JSON.parse(line) as ImportJobEvent;
				onEvent(event);
			} catch {
				// skip malformed event
			}
		}
	}

	onClose?.();
}
