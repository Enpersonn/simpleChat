import type { OllamaMessage, OllamaModel } from '@simplechat/types';
import { getSettings } from '../config.js';

export async function ollamaEndpoint(): Promise<string> {
	const s = await getSettings();
	// Node.js fetch resolves 'localhost' to ::1 (IPv6) on Windows but Ollama
	// typically listens on 127.0.0.1 only, so normalise to avoid connection failures.
	return s.ollamaEndpoint
		.replace(/\/+$/, '')
		.replace(
			/^(https?:\/\/)localhost(:\d+)?/,
			(_, scheme, port) => `${scheme}127.0.0.1${port ?? ''}`,
		);
}

export async function activeModel(): Promise<string> {
	const s = await getSettings();
	return s.activeModel;
}

export async function listModels(): Promise<OllamaModel[]> {
	const endpoint = await ollamaEndpoint();
	const res = await fetch(`${endpoint}/api/tags`);
	if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
	const data = (await res.json()) as { models: OllamaModel[] };
	return data.models ?? [];
}

export async function healthCheck(): Promise<boolean> {
	try {
		const endpoint = await ollamaEndpoint();
		const res = await fetch(`${endpoint}/api/tags`, {
			signal: AbortSignal.timeout(3000),
		});
		return res.ok;
	} catch {
		return false;
	}
}
