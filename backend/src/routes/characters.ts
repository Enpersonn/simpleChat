import {
  type Character,
  CharacterCreateSchema,
  type MemoryDeltaEffect,
  CharacterUpdateSchema,
} from "@simplechat/types";
import type { FastifyInstance } from "fastify";
import { applyMemoryChain } from "../character-state.js";
import { LLMParseError } from "../generate.js";
import { generateSingle } from "../generation/service.js";
import { characters_store } from "../storage/characters/index.js";
import { now } from "../storage/helpers.js";
import {
  character_memory_relations_store,
  getMemoryChainForCharacter,
  memories_store,
} from "../storage/memories/index.js";
import { stories_store } from "../storage/stories/index.js";

async function createGenesisMemory(char: Character): Promise<Character> {
  if (char.genesisMemoryId) return char;

  const effects: MemoryDeltaEffect[] = [];

  for (const trait of char.public.personality) {
    effects.push({ path: "public.personality", op: "add", value: trait, weight: 1, entityType: "character" });
  }
  for (const fear of char.private.fears) {
    effects.push({ path: "private.fears", op: "add", value: fear, weight: 1, entityType: "character" });
  }
  for (const item of char.private.privateKnowledge) {
    effects.push({ path: "private.privateKnowledge", op: "add", value: item, weight: 1, entityType: "character" });
  }
  if (char.public.appearance)
    effects.push({ path: "public.appearance", op: "set", value: char.public.appearance, weight: 1, entityType: "character" });
  if (char.public.speechStyle)
    effects.push({ path: "public.speechStyle", op: "set", value: char.public.speechStyle, weight: 1, entityType: "character" });
  if (char.public.reputation)
    effects.push({ path: "public.reputation", op: "set", value: char.public.reputation, weight: 1, entityType: "character" });
  if (char.public.clothing)
    effects.push({ path: "public.clothing", op: "set", value: char.public.clothing, weight: 1, entityType: "character" });
  if (char.private.trueMotives)
    effects.push({ path: "private.trueMotives", op: "set", value: char.private.trueMotives, weight: 1, entityType: "character" });
  if (char.private.moralLimits)
    effects.push({ path: "private.moralLimits", op: "set", value: char.private.moralLimits, weight: 1, entityType: "character" });
  if (char.private.hiddenEmotionalState)
    effects.push({ path: "private.hiddenEmotionalState", op: "set", value: char.private.hiddenEmotionalState, weight: 1, entityType: "character" });
  if (char.relationships.length > 0)
    effects.push({ path: "relationships", op: "set", value: char.relationships as Record<string, unknown>[], weight: 1, entityType: "character" });
  if (char.locationRelationships.length > 0)
    effects.push({ path: "locationRelationships", op: "set", value: char.locationRelationships as Record<string, unknown>[], weight: 1, entityType: "character" });

  const summaryParts: string[] = [];
  if (char.role) summaryParts.push(`${char.name} is a ${char.role}.`);
  if (char.public.personality.length)
    summaryParts.push(`Personality: ${char.public.personality.join(", ")}.`);
  if (char.public.appearance) summaryParts.push(char.public.appearance);
  if (char.private.trueMotives)
    summaryParts.push(`True motives: ${char.private.trueMotives}`);
  if (!summaryParts.length) summaryParts.push(`${char.name} — starting state.`);

  const t = now();
  const genesis = await memories_store.add({
    summary: summaryParts.join(" "),
    storyId: char.storyId,
    tags: [...char.public.personality, ...char.private.fears].slice(0, 10),
    importance: 1.0,
    deltas: { effects },
    createdAt: t,
    updatedAt: t,
  });

  await character_memory_relations_store.add({
    storyId: char.storyId,
    characterId: char.id,
    memoryId: genesis.id,
    createdAt: t,
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
      return characters_store.list({ storyId: req.params.id });
    },
  );

  app.post<{ Params: { id: string } }>(
    "/stories/:id/characters",
    async (req, reply) => {
      const body = CharacterCreateSchema.safeParse(req.body);
      if (!body.success)
        return reply.status(400).send({ error: body.error.flatten() });
      const char = await characters_store.add({
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

      const chain = await getMemoryChainForCharacter(charId);
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

      const story = await stories_store.get(req.params.id);
      const storyContext = story
        ? `Story: "${story.title}"${story.premise ? `\nPremise: ${story.premise}` : ""}`
        : undefined;

      try {
        return await generateSingle("character", prompt.trim(), { storyContext });
      } catch (err) {
        if (err instanceof LLMParseError)
          return reply
            .status(422)
            .send({ error: "LLM did not return valid JSON", raw: err.raw });
        throw err;
      }
    },
  );
}
