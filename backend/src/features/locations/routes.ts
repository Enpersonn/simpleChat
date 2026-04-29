import { LocationCreateSchema, LocationUpdateSchema } from "@simplechat/types";
import type { FastifyInstance } from "fastify";
import { locations_store } from "./store";

export async function locationsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>("/stories/:id/locations", async (req) => {
    return locations_store.list({ storyId: req.params.id });
  });

  app.post<{ Params: { id: string } }>(
    "/stories/:id/locations",
    async (req, reply) => {
      const body = LocationCreateSchema.safeParse(req.body);
      if (!body.success)
        return reply.status(400).send({ error: body.error.flatten() });
      const location = await locations_store.add({
        storyId: req.params.id,
        ...body.data,
      });
      return reply.status(201).send(location);
    },
  );

  app.patch<{ Params: { id: string; lid: string } }>(
    "/stories/:id/locations/:lid",
    async (req, reply) => {
      const body = LocationUpdateSchema.safeParse(req.body);
      if (!body.success)
        return reply.status(400).send({ error: body.error.flatten() });
      const location = await locations_store.update(req.params.lid, body.data);
      if (!location)
        return reply.status(404).send({ error: "Location not found" });
      return location;
    },
  );

  app.delete<{ Params: { id: string; lid: string } }>(
    "/stories/:id/locations/:lid",
    async (req, reply) => {
      const ok = await locations_store.delete(req.params.lid);
      if (!ok) return reply.status(404).send({ error: "Location not found" });
      return { ok: true };
    },
  );

}
