import { z } from "zod";
import { createPromptRunner } from "../../prompt-runners/create-prompt-runner";

// ─── Chunking ─────────────────────────────────────────────────────────────────

export function chunkText(
  text: string,
  charsPerChunk = 3000,
  overlapChars = 300,
): string[] {
  // Split at sentence boundaries so chunks never cut mid-sentence
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current.length + sentence.length > charsPerChunk && current.length > 0) {
      chunks.push(current.trimEnd());
      // Carry the tail of the previous chunk into the next one for context continuity
      const tail = current.length > overlapChars ? current.slice(-overlapChars) : current;
      current = tail.trimStart() + " " + sentence;
    } else {
      current += (current ? " " : "") + sentence;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function normalizeValue(value: string): string {
  return value
    .trim()
    .replace(/[.,;:!?"']+$/, "")
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

  await Promise.all(Array.from({ length: Math.min(limit, fns.length) }, worker));
  return results;
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch {
      if (i === attempts - 1) return null;
    }
  }
  return null;
}

// ─── Prompt runners ───────────────────────────────────────────────────────────

export const extractionPromptRunner = (tag: string, def: string) =>
  createPromptRunner({
    role: "extractor",
    instructions: `
Extract all "${tag}" found in the text.
An instance of "${tag}" is defined as: ${def}

Rules:
- Return only complete, clearly stated values found verbatim in the text.
- Do not infer, guess, or add anything not present.
- Do not include duplicates.
- Skip cut-off or interrupted words (e.g. "Ali-", "Lon-").
- If none are found, return an empty array.
`,
    outputSchema: z.array(z.string()),
    temperature: 0,
    num_ctx: 8192,
  });

const consolidationRunner = (tag: string, def: string) =>
  createPromptRunner({
    role: "entity consolidator",
    instructions: `
You are cleaning a raw list of "${tag}" extracted across multiple passes of a long text.
An instance of "${tag}" is defined as: ${def}

Rules:
- Merge obvious duplicates and aliases (e.g. "Lucifer" / "lucifer", "the temple" / "temple").
- Remove values that clearly do not fit the definition of "${tag}".
- Remove fragments, cutoffs, or noise.
- Normalise to the most complete, canonical form — capitalise proper nouns.
- Do not add anything not present in the input list.
`,
    outputSchema: z.array(z.string()),
    temperature: 0,
  });

// ─── Main export ──────────────────────────────────────────────────────────────

export type ExtractionTag = [tag: string, def: string];

export type ExtractFromTextOptions = {
  chunks: string[];
  extractionTags: ExtractionTag[];
  /** Max parallel LLM calls. Defaults to 3 — safe for local Ollama. */
  maxConcurrency?: number;
  /** Run a second LLM pass to merge aliases and remove noise. Defaults to true. */
  consolidate?: boolean;
  /** Called after each chunk×tag unit completes. */
  onProgress?: (done: number, total: number) => void;
};

export const extractFromText = async ({
  chunks,
  extractionTags,
  maxConcurrency = 3,
  consolidate = true,
  onProgress,
}: ExtractFromTextOptions): Promise<Record<string, string[]>> => {
  const runners = Object.fromEntries(
    extractionTags.map(([tag, def]) => [tag, extractionPromptRunner(tag, def)]),
  );

  // lowercase key → canonical first-seen form
  const collected: Record<string, Map<string, string>> = Object.fromEntries(
    extractionTags.map(([tag]) => [tag, new Map<string, string>()]),
  );

  let done = 0;
  const total = chunks.length * extractionTags.length;

  // All chunk × tag pairs fire in parallel, throttled by maxConcurrency
  const tasks = chunks.flatMap((chunk) =>
    extractionTags.map(([tag]) => async () => {
      const values = await withRetry(() => runners[tag].run(chunk));
      if (values) {
        for (const raw of values) {
          const value = normalizeValue(raw);
          if (!value) continue;
          const key = value.toLowerCase();
          if (!collected[tag].has(key)) collected[tag].set(key, value);
        }
      }
      onProgress?.(++done, total);
    }),
  );

  await withConcurrencyLimit(tasks, maxConcurrency);

  const raw = Object.fromEntries(
    extractionTags.map(([tag]) => [tag, [...collected[tag].values()]]),
  );

  if (!consolidate) return raw;

  // Consolidation pass — one LLM call per tag over all collected raw values
  const consolidators = Object.fromEntries(
    extractionTags.map(([tag, def]) => [tag, consolidationRunner(tag, def)]),
  );

  const entries = await Promise.all(
    extractionTags.map(async ([tag]) => {
      if (raw[tag].length === 0) return [tag, [] as string[]] as const;
      const result = await withRetry(() =>
        consolidators[tag].run(
          `Raw extracted list:\n${JSON.stringify(raw[tag], null, 2)}`,
        ),
      );
      return [tag, result ?? raw[tag]] as const;
    }),
  );

  return Object.fromEntries(entries);
};
