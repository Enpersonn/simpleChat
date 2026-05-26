import { z } from 'zod';
import { createPromptRunner } from '../../prompt-runners/create-prompt-runner';

export function chunkText(
	text: string,
	charsPerChunk = 3000,
	overlapChars = 300,
): string[] {
	const sentences = text.split(/(?<=[.!?])\s+/);
	const chunks: string[] = [];
	let current = '';

	for (const sentence of sentences) {
		if (
			current.length + sentence.length > charsPerChunk &&
			current.length > 0
		) {
			chunks.push(current.trimEnd());
			const tail =
				current.length > overlapChars
					? current.slice(-overlapChars)
					: current;
			current = `${tail.trimStart()} ${sentence}`;
		} else {
			current += (current ? ' ' : '') + sentence;
		}
	}

	if (current.trim()) chunks.push(current.trim());
	return chunks.length > 0 ? chunks : [text];
}

function normalizeValue(value: string): string {
	return value
		.trim()
		.replace(/[.,;:!?"']+$/, '')
		.trim();
}

async function withConcurrencyLimit<T>(
	fns: (() => Promise<T>)[],
	limit: number,
): Promise<T[]> {
	const results: T[] = new Array(fns.length);
	let next = 0;

	async function worker() {
		while (next < fns.length) {
			const i = next++;
			results[i] = await fns[i]();
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(limit, fns.length) }, worker),
	);
	return results;
}

async function withRetry<T>(
	fn: () => Promise<T>,
	attempts = 2,
): Promise<T | null> {
	for (let i = 0; i < attempts; i++) {
		try {
			return await fn();
		} catch {
			if (i === attempts - 1) return null;
		}
	}
	return null;
}

export const extractionPromptRunner = (tag: string, def: string) =>
	createPromptRunner({
		instructions: `
Extract all "${tag}" found in the text.
An instance of "${tag}" is defined as: ${def}

Rules:
- Return only complete, clearly stated values found verbatim in the text.
- Do not infer, guess, or add anything not present.
- Do not include duplicates.
- Skip cut-off or interrupted words (e.g. "Ali-", "Lon-").
- Skip generic, non-specific nouns — only extract named, specific instances (e.g. skip "the man", "a building", "the street", "home", "the room").
- If none are found, return an empty array.
`,
		num_ctx: 8192,
		outputSchema: z.array(z.string()),
		role: 'extractor',
		temperature: 0,
	});

const consolidationRunner = (tag: string, def: string) =>
	createPromptRunner({
		instructions: `
You are cleaning a raw list of "${tag}" extracted across multiple passes of a long text.
An instance of "${tag}" is defined as: ${def}

Rules:
- Merge ALL name variants of the same entity into ONE entry. Use the longest, most complete and formal form as the canonical name (e.g. "Holmes" / "Mr. Holmes" / "Sherlock Holmes" → "Sherlock Holmes"; "Lestrade" / "Inspector Lestrade" → "Inspector Lestrade").
- A single first name (e.g. "John", "Jane", "Alice") is a valid entry if no longer form exists — do NOT drop it as a fragment.
- Remove values that clearly do not fit the definition of "${tag}".
- Remove only true noise: cut-off words (e.g. "Lon-"), meaningless fragments, or repeated punctuation. A short real name is NOT noise.
- Normalise to the most complete, canonical form — capitalise proper nouns.
- Do not add anything not present in the input list.
`,
		outputSchema: z.array(z.string()),
		role: 'entity consolidator',
		temperature: 0,
	});

export type ExtractionTag = [tag: string, def: string];

export type ExtractedValue = {
	value: string;
	chunkIndices: number[];
};

export type ExtractFromTextOptions = {
	chunks: string[];
	extractionTags: ExtractionTag[];
	maxConcurrency?: number;
	consolidate?: boolean;
	onProgress?: (done: number, total: number) => void;
};

export const extractFromText = async ({
	chunks,
	extractionTags,
	maxConcurrency = 3,
	consolidate = true,
	onProgress,
}: ExtractFromTextOptions): Promise<Record<string, ExtractedValue[]>> => {
	const runners = Object.fromEntries(
		extractionTags.map(([tag, def]) => [
			tag,
			extractionPromptRunner(tag, def),
		]),
	);

	const collected: Record<
		string,
		Map<string, { value: string; chunkIndices: Set<number> }>
	> = Object.fromEntries(extractionTags.map(([tag]) => [tag, new Map()]));

	let done = 0;
	const total = chunks.length * extractionTags.length;

	const tasks = chunks.flatMap((chunk, chunkIndex) =>
		extractionTags.map(([tag]) => async () => {
			const values = await withRetry(() => runners[tag].run(chunk));
			if (values) {
				for (const raw of values) {
					const value = normalizeValue(raw);
					if (!value) continue;
					const key = value.toLowerCase();
					const existing = collected[tag].get(key);
					if (existing) {
						existing.chunkIndices.add(chunkIndex);
					} else {
						collected[tag].set(key, {
							chunkIndices: new Set([chunkIndex]),
							value,
						});
					}
				}
			}
			onProgress?.(++done, total);
		}),
	);

	await withConcurrencyLimit(tasks, maxConcurrency);

	const toExtractedValues = (tag: string): ExtractedValue[] =>
		[...collected[tag].values()].map(({ value, chunkIndices }) => ({
			chunkIndices: [...chunkIndices].sort((a, b) => a - b),
			value,
		}));

	const raw = Object.fromEntries(
		extractionTags.map(([tag]) => [tag, toExtractedValues(tag)]),
	);

	if (!consolidate) return raw;

	const consolidators = Object.fromEntries(
		extractionTags.map(([tag, def]) => [
			tag,
			consolidationRunner(tag, def),
		]),
	);

	const entries = await Promise.all(
		extractionTags.map(async ([tag]) => {
			if (raw[tag].length === 0)
				return [tag, [] as ExtractedValue[]] as const;

			const rawValues = raw[tag].map((e) => e.value);
			const consolidated = await withRetry(() =>
				consolidators[tag].run(
					`Raw extracted list:\n${JSON.stringify(rawValues, null, 2)}`,
				),
			);

			const finalValues = consolidated ?? rawValues;

			const lookup = new Map(
				[...collected[tag].entries()].map(([key, { chunkIndices }]) => [
					key,
					[...chunkIndices].sort((a, b) => a - b),
				]),
			);

			const result: ExtractedValue[] = finalValues.map((v) => ({
				chunkIndices: resolveChunkIndices(v, lookup),
				value: v,
			}));

			return [tag, result] as const;
		}),
	);

	const consolidated = Object.fromEntries(entries);
	return deduplicateAcrossTags(
		consolidated,
		extractionTags.map(([tag]) => tag),
	);
};

// Remove values from lower-priority tags when a higher-priority tag already
// claims the same name (exact) or a superset of it (word-boundary substring).
// Tag priority = order in extractionTags (first = highest).
function deduplicateAcrossTags(
	result: Record<string, ExtractedValue[]>,
	tagOrder: string[],
): Record<string, ExtractedValue[]> {
	const claimed = new Set<string>();

	return Object.fromEntries(
		tagOrder.map((tag) => {
			const filtered = (result[tag] ?? []).filter(({ value }) => {
				const lower = value.toLowerCase();
				for (const cv of claimed) {
					if (cv === lower) return false;
					// "lestrade" should be removed when "inspector lestrade" is already claimed
					if (cv.includes(lower) && containsAsWord(cv, lower))
						return false;
				}
				return true;
			});

			for (const { value } of filtered) claimed.add(value.toLowerCase());
			return [tag, filtered];
		}),
	);
}

function containsAsWord(haystack: string, needle: string): boolean {
	const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`\\b${escaped}\\b`, 'i').test(haystack);
}

function resolveChunkIndices(
	consolidated: string,
	lookup: Map<string, number[]>,
): number[] {
	const key = consolidated.toLowerCase();
	const exact = lookup.get(key);
	if (exact) return exact;
	const all = new Set<number>();
	for (const [rawKey, indices] of lookup) {
		if (key.includes(rawKey) || rawKey.includes(key)) {
			for (const i of indices) all.add(i);
		}
	}
	return [...all].sort((a, b) => a - b);
}
