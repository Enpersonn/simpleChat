import { LocationCreateSchema, LocationUpdateSchema } from "@simplechat/types";
import type { FastifyInstance } from "fastify";
import { LLMParseError } from "../generate.js";
import { generateSingle } from "../generation/service.js";
import { locations_store } from "../storage/locations/index.js";
import { stories_store } from "../storage/stories/index.js";

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

  // ─── AI Location Generation ───────────────────────────────────────────────

  app.post<{ Params: { id: string } }>(
    "/stories/:id/locations/generate-fields",
    async (req, reply) => {
      const { prompt } = req.body as { prompt?: string };
      if (!prompt?.trim())
        return reply.status(400).send({ error: "prompt is required" });

      const story = await stories_store.get(req.params.id);
      const storyContext = story
        ? `Story: "${story.title}"${story.premise ? `\nPremise: ${story.premise}` : ""}`
        : undefined;

      try {
        return await generateSingle("location", prompt.trim(), { storyContext });
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
