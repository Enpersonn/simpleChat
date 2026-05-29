import { createLLM } from '@llm-helpers/an-llm-request-router';
import { ollama } from '@llm-helpers/an-llm-request-router/ollama';
import type {
	ChatProvider,
	EmbeddingBatchProvider,
	EmbeddingProvider,
	JsonProvider,
	LLMBatchEmbedRequest,
	LLMEmbedRequest,
	LLMJsonRequest,
	LLMRequest,
	StreamingProvider,
	ToolProvider,
} from '@llm-helpers/types';
import type { z } from 'zod';
import { activeModel, ollamaEndpoint } from './ollama.js';

type OllamaProvider = ToolProvider &
	ChatProvider &
	StreamingProvider &
	JsonProvider &
	EmbeddingProvider &
	EmbeddingBatchProvider;

export interface RuntimeConfig {
	model?: string;
	numCtx?: number;
}

export interface RuntimeRequestOverrides {
	maxTokens?: number;
	model?: string;
	signal?: AbortSignal;
	temperature?: number;
}

function withDefaults<T extends RuntimeRequestOverrides>(
	request: T,
	defaultModel: string,
): T {
	return {
		...request,
		model: request.model ?? defaultModel,
	} as T;
}

export async function createOllamaRuntime(config: RuntimeConfig = {}) {
	const [baseUrl, defaultModel] = await Promise.all([
		ollamaEndpoint(),
		config.model ? Promise.resolve(config.model) : activeModel(),
	]);

	const llm = createLLM(
		{
			defaultProvider: 'ollama',
			providers: {
				ollama: {
					baseUrl,
					model: defaultModel,
					numCtx: config.numCtx,
				},
			},
		},
		{ adapters: { ollama } },
	);

	const provider = llm.use('ollama') as OllamaProvider;

	return {
		chat(request: LLMRequest) {
			return provider.chat(withDefaults(request, defaultModel));
		},
		defaultModel,
		embed(request: LLMEmbedRequest) {
			return provider.embed(withDefaults(request, defaultModel));
		},
		embedMany(request: LLMBatchEmbedRequest) {
			return provider.embedMany(withDefaults(request, defaultModel));
		},
		json<TSchema extends z.ZodTypeAny>(request: LLMJsonRequest<TSchema>) {
			return provider.json(withDefaults(request, defaultModel));
		},
		provider,
		stream(request: LLMRequest) {
			return provider.stream(withDefaults(request, defaultModel));
		},
	};
}

export async function streamText(
	request: LLMRequest & {
		onChunk?: (text: string) => void;
	},
	config?: RuntimeConfig,
): Promise<string> {
	const runtime = await createOllamaRuntime(config);
	let fullText = '';

	for await (const chunk of runtime.stream(request)) {
		if (!chunk.text) continue;
		fullText += chunk.text;
		request.onChunk?.(chunk.text);
	}

	return fullText;
}
