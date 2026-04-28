import {
  EntityFieldDefCreateSchema,
  EntityFieldDefUpdateSchema,
} from "@simplechat/types";
import type { FastifyInstance } from "fastify";
import { field_defs_store } from "../storage/field-defs/index.js";

export async function fieldDefsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string }; Querystring: { entityType?: string } }>(
    "/stories/:id/field-defs",
    async (req) => {
      const filters: Record<string, unknown> = { storyId: req.params.id };
      if (req.query.entityType) filters.entityType = req.query.entityType;
      return field_defs_store.list(filters);
    },
  );

  app.post<{ Params: { id: string } }>(
    "/stories/:id/field-defs",
    async (req, reply) => {
      const body = EntityFieldDefCreateSchema.safeParse({
        ...(req.body as object),
        storyId: req.params.id,
      });
      if (!body.success)
        return reply.status(400).send({ error: body.error.flatten() });
      const def = await field_defs_store.add(body.data);
      return reply.status(201).send(def);
    },
  );

  app.patch<{ Params: { id: string; defId: string } }>(
    "/stories/:id/field-defs/:defId",
    async (req, reply) => {
      const body = EntityFieldDefUpdateSchema.safeParse(req.body);
      if (!body.success)
        return reply.status(400).send({ error: body.error.flatten() });
      const def = await field_defs_store.update(req.params.defId, body.data);
      if (!def) return reply.status(404).send({ error: "Field def not found" });
      return def;
    },
  );

  app.delete<{ Params: { id: string; defId: string } }>(
    "/stories/:id/field-defs/:defId",
    async (req, reply) => {
      const ok = await field_defs_store.delete(req.params.defId);
      if (!ok) return reply.status(404).send({ error: "Field def not found" });
      return { ok: true };
    },
  );
}
