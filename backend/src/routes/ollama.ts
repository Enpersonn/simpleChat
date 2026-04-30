import type { FastifyInstance } from "fastify";
import { healthCheck, listModels } from "../agents/ollama.js";

export async function ollamaRoutes(app: FastifyInstance): Promise<void> {
  app.get("/ollama/health", async () => {
    const ok = await healthCheck();
    return { ok };
  });

  app.get("/ollama/models", async (req, reply) => {
    try {
      const models = await listModels();
      return models;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to reach Ollama";
      return reply.status(503).send({ error: msg });
    }
  });
}
