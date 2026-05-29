import { createOllamaRuntime } from './runtime.js';

export async function getOllamaAdapter(numCtx?: number) {
	const runtime = await createOllamaRuntime({ numCtx });
	return runtime.provider;
}
