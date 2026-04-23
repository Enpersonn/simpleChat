import {
  type Character,
  CharacterCreateSchema,
  type CharacterDelta,
  CharacterUpdateSchema,
} from "@simplechat/types";
import type { FastifyInstance } from "fastify";
import { applyMemoryChain } from "../character-state.js";
import * as storage from "../storage.js";
import { extractJson } from "../utils.js";

async function createGenesisMemory(storyId: string, char: Character): Promise<Character> {
  if (char.genesisMemoryId) return char

  const deltas: CharacterDelta = {}
  if (char.public.personality.length) deltas.personality = { add: char.public.personality, remove: [] }
  if (char.public.appearance) deltas.appearance = char.public.appearance
  if (char.public.speechStyle) deltas.speechStyle = char.public.speechStyle
  if (char.public.reputation) deltas.reputation = char.public.reputation
  if (char.public.clothing) deltas.clothing = char.public.clothing
  if (char.private.trueMotives) deltas.trueMotives = char.private.trueMotives
  if (char.private.fears.length) deltas.fears = { add: char.private.fears, remove: [] }
  if (char.private.privateKnowledge.length) deltas.privateKnowledge = { add: char.private.privateKnowledge, remove: [] }
  if (char.private.moralLimits) deltas.moralLimits = char.private.moralLimits
  if (char.private.hiddenEmotionalState) deltas.hiddenEmotionalState = char.private.hiddenEmotionalState
  if (char.relationships.length) {
    deltas.relationships = char.relationships.map((r) => ({
      charId: r.charId,
      emotion: r.emotion,
      publicAttitude: r.publicAttitude,
      privateAttitude: r.privateAttitude,
      trustLevel: r.trustLevel,
    }))
  }

  const summaryParts: string[] = []
  if (char.role) summaryParts.push(`${char.name} is a ${char.role}.`)
  if (char.public.personality.length) summaryParts.push(`Personality: ${char.public.personality.join(', ')}.`)
  if (char.public.appearance) summaryParts.push(char.public.appearance)
  if (char.private.trueMotives) summaryParts.push(`True motives: ${char.private.trueMotives}`)
  if (!summaryParts.length) summaryParts.push(`${char.name} — starting state.`)

  const genesis = await storage.addCharacterMemory(storyId, char.id, {
    summary: summaryParts.join(' '),
    tags: [...char.public.personality, ...char.private.fears].slice(0, 10),
    importance: 1.0,
    deltas: Object.keys(deltas).length > 0 ? deltas : undefined,
  })

  const updated = await storage.updateCharacter(storyId, char.id, { genesisMemoryId: genesis.id })
  return updated ?? char
}


export async function charactersRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>(
    "/stories/:id/characters",
    async (req) => {
      return storage.listCharacters(req.params.id);
    },
  );

  app.post<{ Params: { id: string } }>(
    "/stories/:id/characters",
    async (req, reply) => {
      const body = CharacterCreateSchema.safeParse(req.body);
      if (!body.success)
        return reply.status(400).send({ error: body.error.flatten() });
      const char = await storage.createCharacter(req.params.id, body.data);
      const withGenesis = await createGenesisMemory(req.params.id, char);
      return reply.status(201).send(withGenesis);
    },
  );

  app.patch<{ Params: { id: string; cid: string } }>(
    "/stories/:id/characters/:cid",
    async (req, reply) => {
      const body = CharacterUpdateSchema.safeParse(req.body);
      if (!body.success)
        return reply.status(400).send({ error: body.error.flatten() });
      const char = await storage.updateCharacter(
        req.params.id,
        req.params.cid,
        body.data,
      );
      if (!char)
        return reply.status(404).send({ error: "Character not found" });
      return char;
    },
  );

  app.delete<{ Params: { id: string; cid: string } }>(
    "/stories/:id/characters/:cid",
    async (req, reply) => {
      const ok = await storage.deleteCharacter(req.params.id, req.params.cid);
      if (!ok) return reply.status(404).send({ error: "Character not found" });
      return { ok: true };
    },
  );

  app.get<{ Params: { id: string; cid: string } }>(
    "/stories/:id/characters/:cid/relationships",
    async (req, reply) => {
      const { id: storyId, cid: charId } = req.params;
      const char = await storage.getCharacter(storyId, charId);
      if (!char)
        return reply.status(404).send({ error: "Character not found" });

      const heads = await storage.getMemoryHeads(storyId, charId);
      const latestHead = heads.sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      )[0];
      const chain = latestHead
        ? await storage.getMemoryChain(storyId, charId, latestHead.id)
        : [];

      const effective = applyMemoryChain(char, chain);
      const allChars = await storage.listCharacters(storyId);
      const charMap = new Map(allChars.map((c) => [c.id, c.name]));

      return effective.relationships.map((r) => ({
        ...r,
        otherCharName: charMap.get(r.charId) ?? r.charId,
      }));
    },
  );

  app.post<{ Params: { id: string; cid: string } }>(
    "/stories/:id/characters/:cid/genesis",
    async (req, reply) => {
      const char = await storage.getCharacter(req.params.id, req.params.cid)
      if (!char) return reply.status(404).send({ error: "Character not found" })
      const updated = await createGenesisMemory(req.params.id, char)
      return updated
    },
  )

  // ─── AI Character Generation ──────────────────────────────────────────────

  app.post<{ Params: { id: string } }>(
    "/stories/:id/characters/generate-fields",
    async (req, reply) => {
      const { prompt } = req.body as { prompt?: string };
      if (!prompt?.trim())
        return reply.status(400).send({ error: "prompt is required" });

      const story = await storage.getStory(req.params.id);
      const storyContext = story
        ? `Story: "${story.title}"${story.premise ? `\nPremise: ${story.premise}` : ""}`
        : "";

      const { streamChat } = await import("../ollama.js");
      const systemPrompt = [
        "You are a creative writing assistant. Return ONLY valid JSON — no explanation, no markdown, no code fences.",
        "Given a character description, generate a complete character profile.",
        "Return exactly this JSON shape:",
        "{",
        '  "name": "string",',
        '  "role": "string (title or occupation)",',
        '  "age": "string (e.g. \\"mid-30s\\" or \\"ancient\\")",',
        '  "gender": "string",',
        '  "species": "string (e.g. human, wolf, android — default human)",',
        '  "clothing": "string (brief outfit description)",',
        '  "appearance": "string (2-3 sentences of physical description)",',
        '  "personality": ["trait1", "trait2"],',
        '  "speechStyle": "string (one sentence)",',
        '  "trueMotives": "string (hidden goal, 1-2 sentences)",',
        '  "fears": ["fear1", "fear2"]',
        "}",
      ].join("\n");

      let raw = "";
      await streamChat({
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `${storyContext ? storyContext + "\n\n" : ""}Character description: ${prompt.trim()}`,
          },
        ],
        temperature: 0.85,
        onChunk: (text) => {
          raw += text;
        },
      });

      try {
        const data = extractJson(raw) as Record<string, unknown>;
        return {
          name: typeof data.name === "string" ? data.name : "",
          role: typeof data.role === "string" ? data.role : "",
          age: typeof data.age === "string" ? data.age : "",
          gender: typeof data.gender === "string" ? data.gender : "",
          species: typeof data.species === "string" ? data.species : "human",
          clothing: typeof data.clothing === "string" ? data.clothing : "",
          appearance:
            typeof data.appearance === "string" ? data.appearance : "",
          personality: Array.isArray(data.personality)
            ? data.personality.filter((x): x is string => typeof x === "string")
            : [],
          speechStyle:
            typeof data.speechStyle === "string" ? data.speechStyle : "",
          trueMotives:
            typeof data.trueMotives === "string" ? data.trueMotives : "",
          fears: Array.isArray(data.fears)
            ? data.fears.filter((x): x is string => typeof x === "string")
            : [],
        };
      } catch {
        return reply
          .status(422)
          .send({ error: "LLM did not return valid JSON", raw });
      }
    },
  );
}
