import type { LLMAgent } from "../generate.js";
import { storyCharactersParseAgent } from "../features/characters/parsing-agent.js";
import { storyLocationsParseAgent } from "../features/locations/parsing-agent.js";
import { storyMemoriesParseAgent } from "../features/memories/parsing-agent.js";
import { storyCoreParseAgent } from "../features/stories/parsing-agent.js";
import {
  normaliseCharacter,
  normaliseLocation,
  normaliseMemoryItem,
  normaliseStoryCore,
  parseArray,
} from "../normalizers.js";
import { legacyParseAgent } from "./agents.js";
import { parseStoryMultiPass } from "./pipeline.js";
import { chunkText, sanitizeTextForParsing } from "./sanitize.js";

export type ParseType =
  | "story-core"
  | "story-characters"
  | "story-locations"
  | "story-memories"
  | "legacy"
  | "multi-pass";

export interface ParseContext {
  premise?: string;
  characterNames?: string[];
}

export async function runChunked<T>(
  agent: LLMAgent,
  chunks: string[],
  contextPrefix: string,
  arrayKey: string,
  normalise: (item: Record<string, unknown>) => T,
  filter: (item: T) => boolean,
  dedupeBy?: (item: T) => string,
): Promise<T[]> {
  const total = chunks.length;
  const all: T[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const prompt = [
      contextPrefix,
      `Story text (section ${i + 1} of ${total}):\n${chunks[i]}`,
      "Respond with ONLY the JSON object. No other text.",
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      const data = await agent.run(prompt);
      all.push(...parseArray(data, arrayKey, normalise, filter));
    } catch (err) {
      console.warn(`[runChunked] chunk ${i + 1}/${total} failed:`, (err as Error).message);
    }
  }

  if (!dedupeBy) return all;

  const seen = new Set<string>();
  return all.filter((item) => {
    const key = dedupeBy(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function parseEntities(
  type: ParseType,
  text: string,
  ctx?: ParseContext,
): Promise<Record<string, unknown>> {
  switch (type) {
    case "story-core": {
      const sanitized = sanitizeTextForParsing(text);
      const parts: string[] = [];
      if (ctx?.premise) parts.push(`Story premise: ${ctx.premise}`);
      parts.push(`Story text:\n${sanitized}`);
      parts.push("Respond with ONLY the JSON object. No other text.");
      const data = await storyCoreParseAgent.run(parts.join("\n\n"));
      return normaliseStoryCore(data, {
        includeTitle: true,
        includePremise: true,
      });
    }

    case "story-characters": {
      const sanitized = sanitizeTextForParsing(text);
      const contextParts: string[] = [];
      if (ctx?.premise) contextParts.push(`Story premise: ${ctx.premise}`);
      const contextPrefix = contextParts.join("\n\n");
      const chunks = chunkText(sanitized);
      const characters = await runChunked(
        storyCharactersParseAgent,
        chunks,
        contextPrefix,
        "characters",
        normaliseCharacter,
        (c) => !!c.name,
        (c) => c.name.toLowerCase(),
      );
      return { characters };
    }

    case "story-locations": {
      const sanitized = sanitizeTextForParsing(text);
      const contextParts: string[] = [];
      if (ctx?.premise) contextParts.push(`Story premise: ${ctx.premise}`);
      const contextPrefix = contextParts.join("\n\n");
      const chunks = chunkText(sanitized);
      const locations = await runChunked(
        storyLocationsParseAgent,
        chunks,
        contextPrefix,
        "locations",
        normaliseLocation,
        (l) => !!l.name,
        (l) => l.name.toLowerCase(),
      );
      return { locations };
    }

    case "story-memories": {
      const sanitized = sanitizeTextForParsing(text);
      const contextParts: string[] = [];
      if (ctx?.premise) contextParts.push(`Story premise: ${ctx.premise}`);
      if (ctx?.characterNames?.length)
        contextParts.push(`Known characters: ${ctx.characterNames.join(", ")}`);
      const contextPrefix = contextParts.join("\n\n");
      const chunks = chunkText(sanitized);
      const memories = await runChunked(
        storyMemoriesParseAgent,
        chunks,
        contextPrefix,
        "memories",
        normaliseMemoryItem,
        (m) => !!(m.characterName && m.summary),
      );
      return { memories };
    }

    case "legacy": {
      const sanitized = sanitizeTextForParsing(text);
      const parts = [
        `Story text:\n${sanitized}`,
        "Respond with ONLY the JSON object. No other text.",
      ];
      const data = await legacyParseAgent.run(parts.join("\n\n"));
      return {
        ...normaliseStoryCore(data, {
          includeTitle: true,
          includePremise: true,
        }),
        characters: parseArray(
          data,
          "characters",
          normaliseCharacter,
          (c) => !!c.name,
        ),
        locations: parseArray(
          data,
          "locations",
          normaliseLocation,
          (l) => !!l.name,
        ),
      };
    }

    case "multi-pass": {
      return parseStoryMultiPass(text, ctx) as unknown as Promise<Record<string, unknown>>;
    }
  }
}
