import {
  CharacterCreateSchema,
  CharacterUpdateSchema,
} from "@simplechat/types";
import type { FastifyInstance } from "fastify";
import { applyMemoryChain } from "../../character-state.js";
import { getMemoryChainForCharacter } from "../memories/store/index.js";
import { createGenesisMemory } from "./index.js";
import { characters_store } from "./store.js";

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

}
