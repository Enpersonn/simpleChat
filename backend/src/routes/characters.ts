import {
  type Character,
  CharacterCreateSchema,
  type CharacterDelta,
  type CharacterMemoryCreateSchema,
  CharacterUpdateSchema,
} from "@simplechat/types";
import type { FastifyInstance } from "fastify";
import { applyMemoryChain } from "../character-state.js";
import { GenerateAgent } from "../generate.js";
import { characters_store } from "../storage/characters/index.js";
import {
  character_memories_store,
  getMemoryChain,
  getMemoryHeads,
  memories_store,
} from "../storage/memories/index.js";
import { stories_store } from "../storage/stories/index.js";

async function createGenesisMemory(char: Character): Promise<Character> {
  if (char.genesisMemoryId) return char;

  const deltas: CharacterDelta = {};
  if (char.public.personality.length)
    deltas.personality = { add: char.public.personality, remove: [] };
  if (char.public.appearance) deltas.appearance = char.public.appearance;
  if (char.public.speechStyle) deltas.speechStyle = char.public.speechStyle;
  if (char.public.reputation) deltas.reputation = char.public.reputation;
  if (char.public.clothing) deltas.clothing = char.public.clothing;
  if (char.private.trueMotives) deltas.trueMotives = char.private.trueMotives;
  if (char.private.fears.length)
    deltas.fears = { add: char.private.fears, remove: [] };
  if (char.private.privateKnowledge.length)
    deltas.privateKnowledge = {
      add: char.private.privateKnowledge,
      remove: [],
    };
  if (char.private.moralLimits) deltas.moralLimits = char.private.moralLimits;
  if (char.private.hiddenEmotionalState)
    deltas.hiddenEmotionalState = char.private.hiddenEmotionalState;
  if (char.relationships.length) {
    deltas.relationships = char.relationships.map((r) => ({
      charId: r.charId,
      emotion: r.emotion,
      publicAttitude: r.publicAttitude,
      privateAttitude: r.privateAttitude,
      trustLevel: r.trustLevel,
    }));
  }

  const summaryParts: string[] = [];
  if (char.role) summaryParts.push(`${char.name} is a ${char.role}.`);
  if (char.public.personality.length)
    summaryParts.push(`Personality: ${char.public.personality.join(", ")}.`);
  if (char.public.appearance) summaryParts.push(char.public.appearance);
  if (char.private.trueMotives)
    summaryParts.push(`True motives: ${char.private.trueMotives}`);
  if (!summaryParts.length) summaryParts.push(`${char.name} — starting state.`);

  const genesis = await character_memories_store.add<
    typeof CharacterMemoryCreateSchema
  >({
    summary: summaryParts.join(" "),
    characterId: char.id,
    tags: [...char.public.personality, ...char.private.fears].slice(0, 10),
    importance: 1.0,
    deltas: Object.keys(deltas).length > 0 ? deltas : undefined,
  });

  const updated = await characters_store.update(char.id, {
    genesisMemoryId: genesis.id,
  });
  return updated ?? char;
}

export async function charactersRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>(
    "/stories/:id/characters",
    async (req) => {
      return characters_store.list({
        storyId: req.params.id,
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    "/stories/:id/characters",
    async (req, reply) => {
      const body = CharacterCreateSchema.safeParse(req.body);
      if (!body.success)
        return reply.status(400).send({ error: body.error.flatten() });
      const char = await characters_store.add<typeof CharacterCreateSchema>({
        ...body.data,
        storyId: req.params.id,
      });
      const withGenesis = await createGenesisMemory(char);
      return reply.status(201).send(withGenesis);
    },
  );

  app.patch<{ Params: { id: string; cid: string } }>(
    "/stories/:id/characters/:cid",
    async (req, reply) => {
      const body = CharacterUpdateSchema.safeParse(req.body);
      if (!body.success)
        return reply.status(400).send({ error: body.error.flatten() });
      const char = await characters_store.update(req.params.cid, body.data);
      if (!char)
        return reply.status(404).send({ error: "Character not found" });
      return char;
    },
  );

  app.delete<{ Params: { id: string; cid: string } }>(
    "/stories/:id/characters/:cid",
    async (req, reply) => {
      const ok = await characters_store.delete(req.params.cid);
      if (!ok) return reply.status(404).send({ error: "Character not found" });
      return { ok: true };
    },
  );

  app.get<{ Params: { id: string; cid: string } }>(
    "/stories/:id/characters/:cid/relationships",
    async (req, reply) => {
      const { id: storyId, cid: charId } = req.params;
      const char = await characters_store.get(charId);
      if (!char)
        return reply.status(404).send({ error: "Character not found" });

      const heads = await getMemoryHeads(storyId, charId);
      const latestHead = heads.sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      )[0];
      const memories = await memories_store.list();
      const chain = latestHead
        ? await getMemoryChain(latestHead.id, memories)
        : [];

      const effective = applyMemoryChain(char, chain);
      const allChars = await characters_store.list({ storyId });
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
      const char = await characters_store.get(req.params.cid);
      if (!char)
        return reply.status(404).send({ error: "Character not found" });
      const updated = await createGenesisMemory(char);
      return updated;
    },
  );

  // ─── AI Character Generation ──────────────────────────────────────────────

  app.post<{ Params: { id: string } }>(
    "/stories/:id/characters/generate-fields",
    async (req, reply) => {
      const { prompt } = req.body as { prompt?: string };
      if (!prompt?.trim())
        return reply.status(400).send({ error: "prompt is required" });

      const content = `Character description: ${prompt.trim()}`;
      const story = await stories_store.get(req.params.id);
      const storyContext = story
        ? `Story: "${story.title}"${story.premise ? `\nPremise: ${story.premise}` : ""}`
        : "";

      const systemPrompt = [
        "You are a creative writing assistant. Return ONLY valid JSON — no explanation, no markdown, no code fences.",
        "Given a character description, generate a complete character profile.",
      ];

      const exampleRes = [
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
      ];

      const generateAgent = new GenerateAgent({
        systemPrompt: systemPrompt,
        expectedOutput: CharacterCreateSchema,
        exampleOutput: exampleRes,
      });

      return await generateAgent.streamResponse(content, storyContext);
    },
  );
}
