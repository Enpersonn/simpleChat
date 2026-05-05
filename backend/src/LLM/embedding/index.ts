import { ollamaEndpoint } from '../ollama';

type OllamaEmbedResponse = {
	model: string;
	embeddings: number[][];
};

const EMBED_MODEL = 'nomic-embed-text';

export const embedText = async (text: string): Promise<number[]> => {
	const endpoint = await ollamaEndpoint();

	const res = await fetch(`${endpoint}/api/embed`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: EMBED_MODEL,
			input: text,
		}),
	});

	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Ollama error ${res.status}: ${err}`);
	}

	const data = (await res.json()) as OllamaEmbedResponse;

	const embedding = data.embeddings?.[0];
	if (!embedding) {
		throw new Error('No embedding returned from Ollama');
	}

	return embedding;
};

export const embedTexts = async (texts: string[]): Promise<number[][]> => {
	const endpoint = await ollamaEndpoint();

	const res = await fetch(`${endpoint}/api/embed`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: EMBED_MODEL,
			input: texts,
		}),
	});

	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Ollama error ${res.status}: ${err}`);
	}

	const data = (await res.json()) as OllamaEmbedResponse;

	if (!Array.isArray(data.embeddings)) {
		throw new Error('No embeddings returned from Ollama');
	}

	return data.embeddings;
};
