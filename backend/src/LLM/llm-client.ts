import { createLLM } from '@llm-helpers/an-llm-request-router';
import { ollama } from '@llm-helpers/an-llm-request-router/ollama';
import { activeModel, ollamaEndpoint } from './ollama.js';

export async function getOllamaAdapter(numCtx?: number) {
	const [baseUrl, model] = await Promise.all([ollamaEndpoint(), activeModel()]);
	const llm = createLLM(
		{ defaultProvider: 'ollama', providers: { ollama: { baseUrl, model, numCtx } } },
		{ adapters: { ollama } },
	);
	return llm.use('ollama');
}
