import { z } from "zod";
import { createPromptRunner } from "../../prompt-runners/create-prompt-runner";

export const extractionPromptRunner = (tag: string, def: string) =>
  createPromptRunner({
    role: "extractor",
    instructions: `
Extract all "${tag}" found in the text.
An instance of "${tag}" is deffiend as ${def}

Rules:
- Return only complete, clearly stated values.
- Do not infer or guess.
- Do not include duplicates.
- If none are found, return an empty array.
`,
    outputSchema: z.array(z.string()),
    temperature: 0,
    num_ctx: 8192,
  });

type ExtractFromTextProps = {
  chunks: string[];
  extractionTags: [tag: string, def: string][];
};

export function chunkText(text: string, charsPerChunk = 3000): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length > charsPerChunk && current.length > 0) {
      chunks.push(current.trim());
      current = "";
    }
    current += (current ? "\n\n" : "") + para;
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text];
}

export const extractFromText = async ({
  chunks,
  extractionTags,
}: ExtractFromTextProps): Promise<Record<string, string[]>> => {
  console.log("number of chunks", chunks.length);
  const runners = Object.fromEntries(
    extractionTags.map(([tag, def]) => [tag, extractionPromptRunner(tag, def)]),
  );

  // Map from lowercase key → canonical form (first seen wins)
  const extractedObjects: Record<string, Map<string, string>> = Object.fromEntries(
    extractionTags.map(([tag]) => [tag, new Map<string, string>()]),
  );

  for (const chunk of chunks) {
    const results = await Promise.all(
      extractionTags.map(async ([tag]) => ({
        tag,
        values: await runners[tag].run(chunk),
      })),
    );

    for (const { tag, values } of results) {
      for (const value of values) {
        const key = value.toLowerCase();
        if (!extractedObjects[tag].has(key)) {
          extractedObjects[tag].set(key, value);
        }
      }
    }
  }

  return Object.fromEntries(
    Object.entries(extractedObjects).map(([tag, map]) => [tag, [...map.values()]]),
  );
};
