import { StoryCreateSchema, StoryUpdateSchema } from "@simplechat/types";
import type { FastifyInstance } from "fastify";
import { LLMParseError } from "../generate.js";
import { generateRawText, generateSingle } from "../generation/service.js";
import { parseEntities } from "../parsing/service.js";
import { characters_store } from "../storage/characters/index.js";
import { seedDefaultFieldDefs } from "../storage/field-defs/index.js";
import { locations_store } from "../storage/locations/index.js";
import { stories_store } from "../storage/stories/index.js";

function handleLLMError(err: unknown, reply: { status: (code: number) => { send: (body: unknown) => unknown } }) {
  if (err instanceof LLMParseError)
    return reply.status(422).send({ error: "LLM did not return valid JSON", raw: err.raw });
  throw err;
}

export async function storiesRoutes(app: FastifyInstance): Promise<void> {
  // ─── AI Generation (legacy monolithic) ───────────────────────────────────

  app.post("/stories/generate-fields", async (req, reply) => {
    const { concept, includeTitle } = req.body as {
      concept?: string;
      includeTitle?: boolean;
    };
    if (!concept?.trim())
      return reply.status(400).send({ error: "concept is required" });
    try {
      const [core, chars] = await Promise.all([
        generateSingle("story-core", concept.trim(), { includeTitle }),
        generateSingle("story-characters", concept.trim()),
      ]);
      return { ...core, ...chars };
    } catch (err) {
      return handleLLMError(err, reply);
    }
  });

  // ─── AI Generation (multi-step) ───────────────────────────────────────────

  app.post("/stories/generate-story-core", async (req, reply) => {
    const { concept, includeTitle } = req.body as {
      concept?: string;
      includeTitle?: boolean;
    };
    if (!concept?.trim())
      return reply.status(400).send({ error: "concept is required" });
    try {
      return await generateSingle("story-core", concept.trim(), { includeTitle });
    } catch (err) {
      return handleLLMError(err, reply);
    }
  });

  app.post("/stories/generate-story-characters", async (req, reply) => {
    const { concept, genres, tone, writingStyle } = req.body as {
      concept?: string;
      genres?: string[];
      tone?: string[];
      writingStyle?: string;
    };
    if (!concept?.trim())
      return reply.status(400).send({ error: "concept is required" });
    const styleContext = [
      genres?.length ? `Genres: ${genres.join(", ")}` : "",
      tone?.length ? `Tone: ${tone.join(", ")}` : "",
      writingStyle ? `Writing style: ${writingStyle}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      return await generateSingle("story-characters", concept.trim(), {
        styleContext: styleContext || undefined,
      });
    } catch (err) {
      return handleLLMError(err, reply);
    }
  });

  app.post("/stories/generate-story-locations", async (req, reply) => {
    const { concept, genres, tone, writingStyle } = req.body as {
      concept?: string;
      genres?: string[];
      tone?: string[];
      writingStyle?: string;
    };
    if (!concept?.trim())
      return reply.status(400).send({ error: "concept is required" });
    const styleContext = [
      genres?.length ? `Genres: ${genres.join(", ")}` : "",
      tone?.length ? `Tone: ${tone.join(", ")}` : "",
      writingStyle ? `Writing style: ${writingStyle}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      return await generateSingle("story-locations", concept.trim(), {
        styleContext: styleContext || undefined,
      });
    } catch (err) {
      return handleLLMError(err, reply);
    }
  });

  app.post("/stories/generate-story-memories", async (req, reply) => {
    const { concept, premise, characters } = req.body as {
      concept?: string;
      premise?: string;
      characters?: Array<{ name: string }>;
    };
    if (!concept?.trim())
      return reply.status(400).send({ error: "concept is required" });
    const characterNames = Array.isArray(characters)
      ? characters.map((c) => c.name).filter(Boolean)
      : [];
    try {
      return await generateSingle("story-memories", concept.trim(), {
        premise: premise?.trim(),
        characterNames,
      });
    } catch (err) {
      return handleLLMError(err, reply);
    }
  });

  // ─── Import from text (multi-step) ────────────────────────────────────────

  app.post("/stories/parse-story-core", async (req, reply) => {
    const { text } = req.body as { text?: string };
    if (!text?.trim())
      return reply.status(400).send({ error: "text is required" });
    try {
      return await parseEntities("story-core", text.trim());
    } catch (err) {
      return handleLLMError(err, reply);
    }
  });

  app.post("/stories/parse-story-characters", async (req, reply) => {
    const { text, premise } = req.body as { text?: string; premise?: string };
    if (!text?.trim())
      return reply.status(400).send({ error: "text is required" });
    try {
      return await parseEntities("story-characters", text.trim(), {
        premise: premise?.trim(),
      });
    } catch (err) {
      return handleLLMError(err, reply);
    }
  });

  app.post("/stories/parse-story-memories", async (req, reply) => {
    const { text, premise, characters } = req.body as {
      text?: string;
      premise?: string;
      characters?: Array<{ name: string }>;
    };
    if (!text?.trim())
      return reply.status(400).send({ error: "text is required" });
    const characterNames = Array.isArray(characters)
      ? characters.map((c) => c.name).filter(Boolean)
      : [];
    try {
      return await parseEntities("story-memories", text.trim(), {
        premise: premise?.trim(),
        characterNames,
      });
    } catch (err) {
      return handleLLMError(err, reply);
    }
  });

  app.post("/stories/parse-story-locations", async (req, reply) => {
    const { text, premise } = req.body as { text?: string; premise?: string };
    if (!text?.trim())
      return reply.status(400).send({ error: "text is required" });
    try {
      return await parseEntities("story-locations", text.trim(), {
        premise: premise?.trim(),
      });
    } catch (err) {
      return handleLLMError(err, reply);
    }
  });

  // ─── Import from text (legacy monolithic) ────────────────────────────────

  app.post("/stories/parse-text", async (req, reply) => {
    const { text } = req.body as { text?: string };
    if (!text?.trim())
      return reply.status(400).send({ error: "text is required" });
    try {
      return await parseEntities("legacy", text.trim());
    } catch (err) {
      return handleLLMError(err, reply);
    }
  });

  // ─── Stories CRUD ─────────────────────────────────────────────────────────

  app.get("/stories", async () => {
    return stories_store.list();
  });

  app.get<{ Params: { id: string } }>("/stories/:id", async (req, reply) => {
    const story = await stories_store.get(req.params.id);
    if (!story) return reply.status(404).send({ error: "Story not found" });
    const [characters, locations] = await Promise.all([
      characters_store.list({ storyId: req.params.id }),
      locations_store.list({ storyId: req.params.id }),
    ]);
    return { story, characters, locations };
  });

  app.post("/stories", async (req, reply) => {
    const body = StoryCreateSchema.safeParse(req.body);
    if (!body.success)
      return reply.status(400).send({ error: body.error.flatten() });
    const story = await stories_store.add(body.data);
    await seedDefaultFieldDefs(story.id);
    return reply.status(201).send(story);
  });

  app.patch<{ Params: { id: string } }>("/stories/:id", async (req, reply) => {
    const body = StoryUpdateSchema.safeParse(req.body);
    if (!body.success)
      return reply.status(400).send({ error: body.error.flatten() });
    const story = await stories_store.update(req.params.id, body.data);
    if (!story) return reply.status(404).send({ error: "Story not found" });
    return story;
  });

  app.delete<{ Params: { id: string } }>("/stories/:id", async (req, reply) => {
    const ok = await stories_store.delete(req.params.id);
    if (!ok) return reply.status(404).send({ error: "Story not found" });
    return { ok: true };
  });

  // ─── Supporting field generation ──────────────────────────────────────────

  app.post<{ Params: { id: string } }>(
    "/stories/:id/generate-supporting",
    async (req, reply) => {
      const story = await stories_store.get(req.params.id);
      if (!story) return reply.status(404).send({ error: "Story not found" });
      if (!story.premise?.trim())
        return reply
          .status(400)
          .send({ error: "Story has no premise to generate from" });
      try {
        return await generateSingle("supporting-fields", story.premise.trim(), {
          storyContext: `Story: "${story.title}"`,
        });
      } catch (err) {
        return handleLLMError(err, reply);
      }
    },
  );

  // ─── AI Single-Field Autofill (legacy) ───────────────────────────────────

  app.post<{ Params: { id: string } }>(
    "/stories/:id/autofill",
    async (req, reply) => {
      const { field, context } = req.body as { field: string; context: string };
      if (!field) return reply.status(400).send({ error: "field is required" });
      const prompt = `You are a creative writing assistant. Based on the following context, generate content for the "${field}" field of a roleplay story. Return only the generated content, no explanation.\n\nContext:\n${context ?? ""}\n\nGenerate ${field}:`;
      const result = await generateRawText(prompt, 0.9);
      return { field, result };
    },
  );
}
