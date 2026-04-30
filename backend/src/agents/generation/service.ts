import {
  characterAgent,
  storyCharactersAgent,
} from "../../features/characters/generation-agents";
import {
  locationAgent,
  storyLocationsAgent,
} from "../../features/locations/generation-agents";
import { storyMemoriesAgent } from "../../features/memories/generation-agent";
import {
  storyCoreAgent,
  supportingFieldsAgent,
} from "../../features/stories/generation-agents";
import {
  normaliseCharacter,
  normaliseLocation,
  normaliseMemoryItem,
  normaliseStoryCore,
  parseArray,
} from "../normalizers";
import { streamChat } from "../ollama";

export type GenerationType =
  | "story-core"
  | "story-characters"
  | "story-locations"
  | "story-memories"
  | "character"
  | "location"
  | "supporting-fields";

export interface GenerateContext {
  storyContext?: string;
  styleContext?: string;
  premise?: string;
  characterNames?: string[];
  includeTitle?: boolean;
  existingItems?: string[];
}

export async function generateSingle(
  type: GenerationType,
  concept: string,
  ctx?: GenerateContext,
): Promise<Record<string, unknown>> {
  switch (type) {
    case "story-core": {
      const parts = [`Story concept:\n${concept}`];
      if (ctx?.existingItems?.length)
        parts.push(`Do not repeat: ${ctx.existingItems.join(", ")}`);
      parts.push("Respond with ONLY the JSON object. No other text.");
      const data = await storyCoreAgent.run(parts.join("\n\n"));
      return normaliseStoryCore(data, { includeTitle: ctx?.includeTitle });
    }

    case "story-characters": {
      const parts = [`Story concept:\n${concept}`];
      if (ctx?.styleContext) parts.push(ctx.styleContext);
      if (ctx?.existingItems?.length)
        parts.push(
          `Do not create characters with these names (already exist): ${ctx.existingItems.join(", ")}`,
        );
      parts.push("Respond with ONLY the JSON object. No other text.");
      const data = await storyCharactersAgent.run(parts.join("\n\n"));
      return {
        characters: parseArray(
          data,
          "characters",
          normaliseCharacter,
          (c) => !!c.name,
        ),
      };
    }

    case "story-locations": {
      const parts = [`Story concept:\n${concept}`];
      if (ctx?.styleContext) parts.push(ctx.styleContext);
      if (ctx?.existingItems?.length)
        parts.push(
          `Do not create locations with these names (already exist): ${ctx.existingItems.join(", ")}`,
        );
      parts.push("Respond with ONLY the JSON object. No other text.");
      const data = await storyLocationsAgent.run(parts.join("\n\n"));
      return {
        locations: parseArray(
          data,
          "locations",
          normaliseLocation,
          (l) => !!l.name,
        ),
      };
    }

    case "story-memories": {
      const parts: string[] = [];
      if (ctx?.premise) parts.push(`Story premise: ${ctx.premise}`);
      parts.push(`Story concept:\n${concept}`);
      if (ctx?.characterNames?.length)
        parts.push(
          `Characters in this story: ${ctx.characterNames.join(", ")}`,
        );
      if (ctx?.existingItems?.length)
        parts.push(`Do not repeat events for: ${ctx.existingItems.join(", ")}`);
      parts.push("Respond with ONLY the JSON object. No other text.");
      const data = await storyMemoriesAgent.run(parts.join("\n\n"));
      return {
        memories: parseArray(
          data,
          "memories",
          normaliseMemoryItem,
          (m) => !!(m.characterName && m.summary),
        ),
      };
    }

    case "character": {
      const parts: string[] = [];
      if (ctx?.storyContext) parts.push(ctx.storyContext);
      parts.push(`Character description: ${concept}`);
      const data = await characterAgent.run(parts.join("\n\n"));
      return normaliseCharacter(data) as Record<string, unknown>;
    }

    case "location": {
      const parts: string[] = [];
      if (ctx?.storyContext) parts.push(ctx.storyContext);
      parts.push(`Location description: ${concept}`);
      const data = await locationAgent.run(parts.join("\n\n"));
      return normaliseLocation(data) as Record<string, unknown>;
    }

    case "supporting-fields": {
      const parts: string[] = [];
      if (ctx?.storyContext) parts.push(ctx.storyContext);
      if (concept) parts.push(`Premise:\n${concept}`);
      parts.push("Respond with ONLY the JSON object. No other text.");
      const data = await supportingFieldsAgent.run(parts.join("\n\n"));
      return normaliseStoryCore(data);
    }
  }
}

export async function generateList(
  type: GenerationType,
  concept: string,
  count: number,
  ctx?: GenerateContext,
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  const existingNames: string[] = [];

  for (let i = 0; i < count; i++) {
    const item = await generateSingle(type, concept, {
      ...ctx,
      existingItems: existingNames,
    });
    items.push(item);
    const name = typeof item.name === "string" ? item.name : undefined;
    if (name) existingNames.push(name);
  }

  return items;
}

export async function generateRawText(
  userPrompt: string,
  temperature = 0.9,
): Promise<string> {
  let result = "";
  await streamChat({
    messages: [{ role: "user", content: userPrompt }],
    temperature,
    onChunk: (text) => {
      result += text;
    },
  });
  return result.trim();
}
