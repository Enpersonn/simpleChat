import { createOllamaRuntime } from '../runtime.js';

const EMBED_MODEL = 'nomic-embed-text';

export const embedText = async (text: string): Promise<number[]> => {
	const runtime = await createOllamaRuntime({
		model: EMBED_MODEL,
	});
	const response = await runtime.embed({
		input: text,
		model: EMBED_MODEL,
	});
	return response.embedding;
};

export const embedTexts = async (texts: string[]): Promise<number[][]> => {
	const runtime = await createOllamaRuntime({
		model: EMBED_MODEL,
	});
	const response = await runtime.embedMany({
		input: texts,
		model: EMBED_MODEL,
	});
	return response.embeddings;
};
