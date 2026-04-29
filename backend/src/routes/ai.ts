import type { FastifyInstance } from "fastify";
import { LLMParseError } from "../generate.js";
import {
  type GenerateContext,
  type GenerationType,
  generateList,
  generateSingle,
} from "../generation/service.js";
import {
  type ParseContext,
  type ParseType,
  parseEntities,
} from "../parsing/service.js";

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  app.post("/ai/generate", async (req, reply) => {
    const { type, concept, context, count } = req.body as {
      type?: GenerationType;
      concept?: string;
      context?: GenerateContext;
      count?: number;
    };

    if (!type) return reply.status(400).send({ error: "type is required" });
    if (!concept?.trim())
      return reply.status(400).send({ error: "concept is required" });

    try {
      if (count && count > 1) {
        const items = await generateList(type, concept.trim(), count, context);
        return { items };
      }
      return await generateSingle(type, concept.trim(), context);
    } catch (err) {
      if (err instanceof LLMParseError)
        return reply
          .status(422)
          .send({ error: "LLM did not return valid JSON", raw: err.raw });
      throw err;
    }
  });

  app.post("/ai/parse", async (req, reply) => {
    const { type, text, context } = req.body as {
      type?: ParseType;
      text?: string;
      context?: ParseContext;
    };

    if (!type) return reply.status(400).send({ error: "type is required" });
    if (!text?.trim())
      return reply.status(400).send({ error: "text is required" });

    try {
      return await parseEntities(type, text.trim(), context);
    } catch (err) {
      if (err instanceof LLMParseError)
        return reply
          .status(422)
          .send({ error: "LLM did not return valid JSON", raw: err.raw });
      throw err;
    }
  });
}
