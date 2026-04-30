import { characterDeepDiveAgent } from "../../features/characters/parsing-agent.js";
import { storyLocationsParseAgent } from "../../features/locations/parsing-agent.js";
import { storyMemoriesParseAgent } from "../../features/memories/parsing-agent.js";
import { storyCoreParseAgent } from "../../features/stories/parsing-agent.js";
import {
  normaliseCharacter,
  normaliseLocation,
  normaliseMemoryItem,
  normaliseStoryCore,
  parseArray,
} from "../normalizers.js";
import { censusAgent } from "./census-agent.js";
import { identityAgent } from "./identity-agent.js";
import { relationshipAgent } from "./relationship-agent.js";
import { chunkText, sanitizeTextForParsing } from "./sanitize.js";
import { type ParseContext, runChunked } from "./service.js";

interface EntityManifest {
  characterNames: string[];
  locationNames: string[];
  sceneNames: string[];
}

type NormalisedCharacter = ReturnType<typeof normaliseCharacter>;
type NormalisedLocation = ReturnType<typeof normaliseLocation>;
type NormalisedMemory = ReturnType<typeof normaliseMemoryItem>;
type NormalisedStoryCore = ReturnType<typeof normaliseStoryCore>;

export interface MultiPassResult {
  storyCore: NormalisedStoryCore;
  characters: NormalisedCharacter[];
  locations: NormalisedLocation[];
  memories: NormalisedMemory[];
}

async function runCensus(text: string): Promise<EntityManifest> {
  try {
    const data = await censusAgent.run(`Story text:\n${text}`);
    return {
      characterNames: Array.isArray(data.characterNames)
        ? data.characterNames.filter((n): n is string => typeof n === "string")
        : [],
      locationNames: Array.isArray(data.locationNames)
        ? data.locationNames.filter((n): n is string => typeof n === "string")
        : [],
      sceneNames: Array.isArray(data.sceneNames)
        ? data.sceneNames.filter((n): n is string => typeof n === "string")
        : [],
    };
  } catch {
    return { characterNames: [], locationNames: [], sceneNames: [] };
  }
}

async function runStoryCore(
  text: string,
  manifest: EntityManifest,
  ctx?: ParseContext,
): Promise<NormalisedStoryCore> {
  const parts: string[] = [];
  if (ctx?.premise) parts.push(`Story premise: ${ctx.premise}`);
  parts.push(`Story text:\n${text}`);
  if (manifest.characterNames.length)
    parts.push(`Characters: ${manifest.characterNames.join(", ")}`);
  parts.push("Respond with ONLY the JSON object. No other text.");
  const data = await storyCoreParseAgent.run(parts.join("\n\n"));
  return normaliseStoryCore(data, { includeTitle: true, includePremise: true });
}

async function runLocations(
  chunks: string[],
  manifest: EntityManifest,
  ctx?: ParseContext,
): Promise<NormalisedLocation[]> {
  const prefixParts: string[] = [];
  if (ctx?.premise) prefixParts.push(`Story premise: ${ctx.premise}`);
  if (manifest.locationNames.length)
    prefixParts.push(
      `Expected locations: ${manifest.locationNames.join(", ")}`,
    );
  return runChunked(
    storyLocationsParseAgent,
    chunks,
    prefixParts.join("\n\n"),
    "locations",
    normaliseLocation,
    (l) => !!l.name,
    (l) => l.name.toLowerCase(),
  );
}

async function runCharacterDeepDive(
  characterName: string,
  chunks: string[],
  ctx?: ParseContext,
): Promise<NormalisedCharacter | null> {
  const prefixParts: string[] = [];
  if (ctx?.premise) prefixParts.push(`Story premise: ${ctx.premise}`);
  prefixParts.push(`Extract EVERYTHING about: ${characterName}`);
  try {
    const results = await runChunked(
      characterDeepDiveAgent,
      chunks,
      prefixParts.join("\n\n"),
      "characters",
      normaliseCharacter,
      (c) => !!c.name,
    );
    // The deep-dive agent returns a single object wrapped in an array via the outputShape trick.
    // If it returns the object at root level instead, handle that too.
    const found = results.find(
      (c) => c.name.toLowerCase() === characterName.toLowerCase(),
    );
    if (found) return found;
    // Fallback: agent may return root-level object rather than array
    const parts: string[] = [];
    if (ctx?.premise) parts.push(`Story premise: ${ctx.premise}`);
    parts.push(
      `Extract EVERYTHING about the character named "${characterName}" from this story text.`,
    );
    parts.push(`Story text (section 1 of ${chunks.length}):\n${chunks[0]}`);
    parts.push("Respond with ONLY the JSON object. No other text.");
    const raw = await characterDeepDiveAgent.run(parts.join("\n\n"));
    return normaliseCharacter(raw);
  } catch {
    return null;
  }
}

async function mergeRelationships(
  text: string,
  characters: NormalisedCharacter[],
): Promise<NormalisedCharacter[]> {
  if (characters.length === 0) return characters;
  try {
    const charList = characters.map((c) => c.name).join(", ");
    const data = await relationshipAgent.run(
      `Characters: ${charList}\n\nStory text:\n${text}`,
    );
    const rawRels = Array.isArray(data.relationships) ? data.relationships : [];
    for (const rel of rawRels as Record<string, unknown>[]) {
      const fromName =
        typeof rel.fromCharacter === "string" ? rel.fromCharacter : "";
      const toName = typeof rel.toCharacter === "string" ? rel.toCharacter : "";
      if (!fromName || !toName) continue;
      const char = characters.find(
        (c) => c.name.toLowerCase() === fromName.toLowerCase(),
      );
      if (!char) continue;
      const edge = {
        otherCharacterName: toName,
        emotion: typeof rel.emotion === "string" ? rel.emotion : "",
        publicAttitude:
          typeof rel.publicAttitude === "string" ? rel.publicAttitude : "",
        privateAttitude:
          typeof rel.privateAttitude === "string" ? rel.privateAttitude : "",
        trustLevel:
          typeof rel.trustLevel === "number"
            ? Math.min(10, Math.max(0, rel.trustLevel))
            : 5,
      };
      const existing = char.relationships.find(
        (r) => r.otherCharacterName.toLowerCase() === toName.toLowerCase(),
      );
      if (!existing) char.relationships.push(edge);
    }
  } catch {
    // non-fatal
  }
  return characters;
}

async function runTimeline(
  chunks: string[],
  characters: NormalisedCharacter[],
  manifest: EntityManifest,
  ctx?: ParseContext,
): Promise<NormalisedMemory[]> {
  const charList = characters.map((c) => c.name).join(", ");
  const prefixParts: string[] = [];
  if (ctx?.premise) prefixParts.push(`Story premise: ${ctx.premise}`);
  prefixParts.push(`Known characters: ${charList}`);
  if (manifest.sceneNames.length)
    prefixParts.push(`Known scenes: ${manifest.sceneNames.join(", ")}`);
  return runChunked(
    storyMemoriesParseAgent,
    chunks,
    prefixParts.join("\n\n"),
    "memories",
    normaliseMemoryItem,
    (m) => !!(m.characterName && m.summary),
  );
}

async function mergeIdentities(
  characters: NormalisedCharacter[],
  memories: NormalisedMemory[],
): Promise<NormalisedCharacter[]> {
  if (characters.length === 0) return characters;
  try {
    const charList = characters.map((c) => c.name).join(", ");
    const timelineSummary = memories
      .slice(0, 20)
      .map((m) => `${m.characterName}: ${m.summary}`)
      .join("\n");
    const data = await identityAgent.run(
      `Characters: ${charList}\n\nTimeline summary:\n${timelineSummary}`,
    );
    const links = Array.isArray(data.links) ? data.links : [];
    for (const link of links as Record<string, unknown>[]) {
      const charName =
        typeof link.characterName === "string" ? link.characterName : "";
      if (!charName) continue;
      const char = characters.find(
        (c) => c.name.toLowerCase() === charName.toLowerCase(),
      );
      if (!char) continue;
      if (Array.isArray(link.linkedCharacterNames)) {
        for (const n of link.linkedCharacterNames as unknown[]) {
          if (typeof n === "string" && !char.linkedCharacterNames.includes(n)) {
            char.linkedCharacterNames.push(n);
          }
        }
      }
      if (Array.isArray(link.identities)) {
        for (const raw of link.identities as Record<string, unknown>[]) {
          if (!raw || typeof raw.name !== "string" || !raw.name) continue;
          const already = char.identities.find(
            (i) => i.name.toLowerCase() === (raw.name as string).toLowerCase(),
          );
          if (!already) {
            char.identities.push({
              id: crypto.randomUUID(),
              name: raw.name as string,
              appearance:
                typeof raw.appearance === "string" ? raw.appearance : "",
              abilities: Array.isArray(raw.abilities)
                ? (raw.abilities as unknown[]).filter(
                    (x): x is string => typeof x === "string",
                  )
                : [],
              selfAware: raw.selfAware !== false,
              knownBy: [],
              conditions:
                typeof raw.conditions === "string" ? raw.conditions : "",
              notes: typeof raw.notes === "string" ? raw.notes : "",
            });
          }
        }
      }
    }
  } catch {
    // non-fatal
  }
  return characters;
}

export async function parseStoryMultiPass(
  text: string,
  ctx?: ParseContext,
): Promise<MultiPassResult> {
  const sanitized = sanitizeTextForParsing(text);
  const chunks = chunkText(sanitized);

  // Stage 1: Census
  const manifest = await runCensus(sanitized);

  // Stage 2: Story core
  const storyCore = await runStoryCore(sanitized, manifest, ctx);

  // Stage 3: Locations
  const locations = await runLocations(chunks, manifest, ctx);

  if (manifest.characterNames.length === 0) {
    return { storyCore, characters: [], locations, memories: [] };
  }

  // Stage 4: Per-character deep-dive (parallel)
  const deepDiveResults = await Promise.all(
    manifest.characterNames.map((name) =>
      runCharacterDeepDive(name, chunks, ctx),
    ),
  );
  const characters = deepDiveResults.filter(
    (c): c is NormalisedCharacter => c !== null && !!c.name,
  );

  // Stage 5: Relationship merge
  await mergeRelationships(sanitized, characters);

  // Stage 6: Timeline + delta
  const memories = await runTimeline(chunks, characters, manifest, ctx);

  // Stage 7: Identity resolution
  await mergeIdentities(characters, memories);

  return { storyCore, characters, locations, memories };
}
