import {
  normaliseCharacter,
  normaliseLocation,
  normaliseMemoryItem,
  normaliseStoryCore,
  parseArray,
} from "../normalizers.js";
import {
  legacyParseAgent,
  storyCoreParseAgent,
  storyCharactersParseAgent,
  storyLocationsParseAgent,
  storyMemoriesParseAgent,
} from "./agents.js";
import { sanitizeTextForParsing } from "./sanitize.js";

export type ParseType =
  | "story-core"
  | "story-characters"
  | "story-locations"
  | "story-memories"
  | "legacy";

export interface ParseContext {
  premise?: string;
  characterNames?: string[];
}

export async function parseEntities(
  type: ParseType,
  text: string,
  ctx?: ParseContext,
): Promise<Record<string, unknown>> {
  const sanitized = sanitizeTextForParsing(text, ctx?.characterNames);

  switch (type) {
    case "story-core": {
      const parts: string[] = [];
      if (ctx?.premise) parts.push(`Story premise: ${ctx.premise}`);
      parts.push(`Story text:\n${sanitized}`);
      parts.push("Respond with ONLY the JSON object. No other text.");
      const data = await storyCoreParseAgent.run(parts.join("\n\n"));
      return normaliseStoryCore(data, { includeTitle: true, includePremise: true });
    }

    case "story-characters": {
      const parts: string[] = [];
      if (ctx?.premise) parts.push(`Story premise: ${ctx.premise}`);
      parts.push(`Story text:\n${sanitized}`);
      parts.push("Respond with ONLY the JSON object. No other text.");
      const data = await storyCharactersParseAgent.run(parts.join("\n\n"));
      return {
        characters: parseArray(data, "characters", normaliseCharacter, (c) => !!c.name),
      };
    }

    case "story-locations": {
      const parts: string[] = [];
      if (ctx?.premise) parts.push(`Story premise: ${ctx.premise}`);
      parts.push(`Story text:\n${sanitized}`);
      parts.push("Respond with ONLY the JSON object. No other text.");
      const data = await storyLocationsParseAgent.run(parts.join("\n\n"));
      return {
        locations: parseArray(data, "locations", normaliseLocation, (l) => !!l.name),
      };
    }

    case "story-memories": {
      const parts: string[] = [];
      if (ctx?.premise) parts.push(`Story premise: ${ctx.premise}`);
      parts.push(`Story text:\n${sanitized}`);
      parts.push("Respond with ONLY the JSON object. No other text.");
      const data = await storyMemoriesParseAgent.run(parts.join("\n\n"));
      return {
        memories: parseArray(
          data,
          "memories",
          normaliseMemoryItem,
          (m) => !!(m.characterName && m.summary),
        ),
      };
    }

    case "legacy": {
      const parts = [
        `Story text:\n${sanitized}`,
        "Respond with ONLY the JSON object. No other text.",
      ];
      const data = await legacyParseAgent.run(parts.join("\n\n"));
      return {
        ...normaliseStoryCore(data, { includeTitle: true, includePremise: true }),
        characters: parseArray(data, "characters", normaliseCharacter, (c) => !!c.name),
        locations: parseArray(data, "locations", normaliseLocation, (l) => !!l.name),
      };
    }
  }
}
