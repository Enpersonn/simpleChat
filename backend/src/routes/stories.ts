import { StoryCreateSchema, StoryUpdateSchema } from "@simplechat/types";
import type { FastifyInstance } from "fastify";
import * as storage from "../storage.js";
import { extractJson } from "../utils.js";

function normaliseCharacter(c: Record<string, unknown>) {
  const rawRels = Array.isArray(c.relationships) ? c.relationships : [];
  const relationships = rawRels
    .filter(
      (r): r is Record<string, unknown> => typeof r === "object" && r !== null,
    )
    .map((r) => ({
      otherCharacterName:
        typeof r.otherCharacterName === "string" ? r.otherCharacterName : "",
      emotion: typeof r.emotion === "string" ? r.emotion : "",
      publicAttitude:
        typeof r.publicAttitude === "string" ? r.publicAttitude : "",
      privateAttitude:
        typeof r.privateAttitude === "string" ? r.privateAttitude : "",
      trustLevel:
        typeof r.trustLevel === "number"
          ? Math.min(10, Math.max(0, r.trustLevel))
          : 5,
    }))
    .filter((r) => r.otherCharacterName);
  return {
    name: typeof c.name === "string" ? c.name : "",
    role: typeof c.role === "string" ? c.role : "",
    isUserPersona: c.isUserPersona === true,
    age: typeof c.age === "string" ? c.age : "",
    gender: typeof c.gender === "string" ? c.gender : "",
    species: typeof c.species === "string" ? c.species : "human",
    clothing: typeof c.clothing === "string" ? c.clothing : "",
    appearance: typeof c.appearance === "string" ? c.appearance : "",
    personality: Array.isArray(c.personality)
      ? c.personality.filter((x): x is string => typeof x === "string")
      : [],
    speechStyle: typeof c.speechStyle === "string" ? c.speechStyle : "",
    trueMotives: typeof c.trueMotives === "string" ? c.trueMotives : "",
    fears: Array.isArray(c.fears)
      ? c.fears.filter((x): x is string => typeof x === "string")
      : [],
    relationships,
  };
}

function normaliseLocation(l: Record<string, unknown>) {
  return {
    name: typeof l.name === "string" ? l.name : "",
    description: typeof l.description === "string" ? l.description : "",
    layout: typeof l.layout === "string" ? l.layout : "",
    lighting: typeof l.lighting === "string" ? l.lighting : "",
    atmosphere: typeof l.atmosphere === "string" ? l.atmosphere : "",
    soundscape: typeof l.soundscape === "string" ? l.soundscape : "",
    smells: typeof l.smells === "string" ? l.smells : "",
    notes: typeof l.notes === "string" ? l.notes : "",
    tags: Array.isArray(l.tags)
      ? l.tags.filter((x): x is string => typeof x === "string")
      : [],
  };
}

function parseCharactersArray(data: Record<string, unknown>) {
  const raw = Array.isArray(data.characters) ? data.characters : [];
  return raw
    .filter(
      (c): c is Record<string, unknown> => typeof c === "object" && c !== null,
    )
    .map(normaliseCharacter)
    .filter((c) => c.name);
}

function parseLocationsArray(data: Record<string, unknown>) {
  const raw = Array.isArray(data.locations) ? data.locations : [];
  return raw
    .filter(
      (l): l is Record<string, unknown> => typeof l === "object" && l !== null,
    )
    .map(normaliseLocation)
    .filter((l) => l.name);
}

function normaliseMemoryDeltas(data: Record<string, unknown>) {
  const rawMems = Array.isArray(data.memories) ? data.memories : [];
  return rawMems
    .filter(
      (m): m is Record<string, unknown> => typeof m === "object" && m !== null,
    )
    .map((m) => {
      const rawDeltas =
        typeof m.deltas === "object" && m.deltas !== null
          ? (m.deltas as Record<string, unknown>)
          : null;
      const rawRelEffects =
        rawDeltas && Array.isArray(rawDeltas.relationships)
          ? rawDeltas.relationships
          : [];
      const relationshipEffects = rawRelEffects
        .filter(
          (r): r is Record<string, unknown> =>
            typeof r === "object" && r !== null,
        )
        .map((r) => ({
          otherCharacterName:
            typeof r.otherCharacterName === "string" ? r.otherCharacterName : "",
          emotion: typeof r.emotion === "string" ? r.emotion : "",
          publicAttitude:
            typeof r.publicAttitude === "string" ? r.publicAttitude : "",
          privateAttitude:
            typeof r.privateAttitude === "string" ? r.privateAttitude : "",
          trustLevel:
            typeof r.trustLevel === "number"
              ? Math.min(10, Math.max(0, r.trustLevel))
              : 5,
        }))
        .filter((r) => r.otherCharacterName);
      const deltasWithoutRelationships = rawDeltas
        ? Object.fromEntries(
            Object.entries(rawDeltas).filter(([k]) => k !== "relationships"),
          )
        : undefined;
      return {
        characterName:
          typeof m.characterName === "string" ? m.characterName : "",
        summary: typeof m.summary === "string" ? m.summary : "",
        tags: Array.isArray(m.tags)
          ? m.tags.filter((t): t is string => typeof t === "string")
          : [],
        importance:
          typeof m.importance === "number"
            ? Math.min(1, Math.max(0, m.importance))
            : 0.5,
        deltas:
          deltasWithoutRelationships &&
          Object.keys(deltasWithoutRelationships).length > 0
            ? deltasWithoutRelationships
            : undefined,
        relationshipEffects:
          relationshipEffects.length > 0 ? relationshipEffects : undefined,
      };
    })
    .filter((m) => m.characterName && m.summary);
}

const STORY_GENRES = [
  "Fantasy",
  "Sci-Fi",
  "Horror",
  "Romance",
  "Mystery",
  "Thriller",
  "Historical",
  "Contemporary",
];
const STORY_TONES = [
  "Dark",
  "Light",
  "Grim",
  "Hopeful",
  "Intimate",
  "Epic",
  "Tense",
  "Whimsical",
  "Melancholic",
  "Romantic",
];

export async function storiesRoutes(app: FastifyInstance): Promise<void> {
  // ─── AI Generation (legacy monolithic) ───────────────────────────────────

  app.post("/stories/generate-fields", async (req, reply) => {
    const { concept, includeTitle } = req.body as {
      concept?: string;
      includeTitle?: boolean;
    };
    if (!concept?.trim())
      return reply.status(400).send({ error: "concept is required" });

    const { streamChat } = await import("../ollama.js");
    const titleField = includeTitle ? '\n  "title": "string",' : "";
    const systemPrompt = [
      "You are a creative writing assistant. Return ONLY valid JSON — no explanation, no markdown, no code fences.",
      "Given a story concept, extract characters and generate supporting configuration.",
      `Return exactly this JSON shape:{${titleField}`,
      '  "genres": ["string", ...],',
      `  // allowed genres: ${STORY_GENRES.join(", ")}`,
      '  "tone": ["string", ...],',
      `  // allowed tones: ${STORY_TONES.join(", ")}`,
      '  "rules": ["string", ...],',
      "  // 2-4 world rules as short sentences",
      '  "writingStyle": "string",',
      "  // one sentence describing narrative style",
      '  "characters": [',
      "    {",
      '      "name": "string",',
      '      "role": "string",',
      '      "isUserPersona": false,',
      "      // set isUserPersona: true only if this is explicitly the player/user character",
      '      "age": "string",',
      '      "gender": "string",',
      '      "species": "string",',
      '      "clothing": "string",',
      '      "appearance": "string",',
      '      "personality": ["trait"],',
      '      "speechStyle": "string",',
      '      "trueMotives": "string",',
      '      "fears": ["fear"]',
      "    }",
      "  ]",
      "  // extract named characters from the concept; create 1-3 if none are named",
      "}",
    ].join("\n");

    let raw = "";
    await streamChat({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Story concept:\n${concept.trim()}` },
      ],
      temperature: 0.85,
      onChunk: (text) => {
        raw += text;
      },
    });

    try {
      const data = extractJson(raw) as Record<string, unknown>;
      return {
        ...(includeTitle && typeof data.title === "string"
          ? { title: data.title }
          : {}),
        genres: Array.isArray(data.genres)
          ? data.genres.filter((x): x is string => typeof x === "string")
          : [],
        tone: Array.isArray(data.tone)
          ? data.tone.filter((x): x is string => typeof x === "string")
          : [],
        rules: Array.isArray(data.rules)
          ? data.rules.filter((x): x is string => typeof x === "string")
          : [],
        writingStyle:
          typeof data.writingStyle === "string" ? data.writingStyle : "",
        characters: parseCharactersArray(data),
      };
    } catch {
      return reply
        .status(422)
        .send({ error: "LLM did not return valid JSON", raw });
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

    const { streamChat } = await import("../ollama.js");
    const systemPrompt = [
      "You are a creative writing assistant. Your ONLY job is to output a single JSON object — nothing else.",
      "Do NOT write characters. Do NOT write any explanation, commentary, or prose. Do NOT use markdown or code fences.",
      "Given a story concept, generate the story metadata only. Output ONLY the raw JSON object below:",
      "{",
      ...(includeTitle ? ['  "title": "string",'] : []),
      '  "genres": ["string", ...],',
      `  // allowed genres: ${STORY_GENRES.join(", ")}`,
      '  "tone": ["string", ...],',
      `  // allowed tones: ${STORY_TONES.join(", ")}`,
      '  "rules": ["string", ...],',
      "  // 2-4 world rules as short sentences",
      '  "writingStyle": "string"',
      "  // one sentence describing narrative style",
      "}",
    ].join("\n");

    let raw = "";
    await streamChat({
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Story concept:\n${concept.trim()}\n\nRespond with ONLY the JSON object. No other text.`,
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
        ...(includeTitle && typeof data.title === "string"
          ? { title: data.title }
          : {}),
        genres: Array.isArray(data.genres)
          ? data.genres.filter((x): x is string => typeof x === "string")
          : [],
        tone: Array.isArray(data.tone)
          ? data.tone.filter((x): x is string => typeof x === "string")
          : [],
        rules: Array.isArray(data.rules)
          ? data.rules.filter((x): x is string => typeof x === "string")
          : [],
        writingStyle:
          typeof data.writingStyle === "string" ? data.writingStyle : "",
      };
    } catch {
      return reply
        .status(422)
        .send({ error: "LLM did not return valid JSON", raw });
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

    const { streamChat } = await import("../ollama.js");
    const systemPrompt = [
      "You are a creative writing assistant. Your ONLY job is to output a single JSON object — nothing else.",
      "Do NOT write any explanation, commentary, or prose. Do NOT use markdown or code fences.",
      "Given a story concept and its established style, create the characters. Output ONLY the raw JSON object below:",
      "{",
      '  "characters": [',
      "    {",
      '      "name": "string",',
      '      "role": "string",',
      '      "isUserPersona": false,',
      "      // set isUserPersona: true only if this is explicitly the player/user character",
      '      "age": "string",',
      '      "gender": "string",',
      '      "species": "string",',
      '      "clothing": "string",',
      '      "appearance": "string",',
      '      "personality": ["trait"],',
      '      "speechStyle": "string",',
      '      "trueMotives": "string",',
      '      "fears": ["fear"],',
      '      "relationships": [',
      "        {",
      '          "otherCharacterName": "string — must match another character\'s name exactly",',
      '          "emotion": "string — e.g. love, fear, rivalry, ally, hate, distrust, respect, neutral",',
      '          "publicAttitude": "string — how they visibly act toward this character",',
      '          "privateAttitude": "string — their hidden feelings toward this character",',
      '          "trustLevel": 5',
      "          // trustLevel 0-10: 0=no trust, 5=neutral, 10=complete trust",
      "        }",
      "      ]",
      "      // omit relationships array if the character has no notable relationships",
      "    }",
      "  ]",
      "  // extract named characters from the concept; create 1-3 if none are named",
      "}",
    ].join("\n");

    const styleContext = [
      genres?.length ? `Genres: ${genres.join(", ")}` : "",
      tone?.length ? `Tone: ${tone.join(", ")}` : "",
      writingStyle ? `Writing style: ${writingStyle}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    let raw = "";
    await streamChat({
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Story concept:\n${concept.trim()}${styleContext ? `\n\n${styleContext}` : ""}\n\nRespond with ONLY the JSON object. No other text.`,
        },
      ],
      temperature: 0.85,
      onChunk: (text) => {
        raw += text;
      },
    });

    try {
      const data = extractJson(raw) as Record<string, unknown>;
      return { characters: parseCharactersArray(data) };
    } catch {
      return reply
        .status(422)
        .send({ error: "LLM did not return valid JSON", raw });
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

    const { streamChat } = await import("../ollama.js");
    const styleContext = [
      genres?.length ? `Genres: ${genres.join(", ")}` : "",
      tone?.length ? `Tone: ${tone.join(", ")}` : "",
      writingStyle ? `Writing style: ${writingStyle}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const systemPrompt = [
      "You are a creative writing assistant. Your ONLY job is to output a single JSON object — nothing else.",
      "Do NOT write any explanation, commentary, or prose. Do NOT use markdown or code fences.",
      "Given a story concept and its established style, invent 2–4 compelling, distinct locations that fit this story world.",
      "Output ONLY the raw JSON object below:",
      "{",
      '  "locations": [',
      "    {",
      '      "name": "string",',
      '      "description": "string — 1-2 sentences of vivid atmosphere",',
      '      "layout": "string",',
      '      "lighting": "string",',
      '      "atmosphere": "string",',
      '      "soundscape": "string",',
      '      "smells": "string",',
      '      "notes": "string",',
      '      "tags": ["string"]',
      "    }",
      "  ]",
      "}",
    ].join("\n");

    let raw = "";
    await streamChat({
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Story concept:\n${concept.trim()}${styleContext ? `\n\n${styleContext}` : ""}\n\nRespond with ONLY the JSON object. No other text.`,
        },
      ],
      temperature: 0.85,
      onChunk: (text) => {
        raw += text;
      },
    });

    try {
      const data = extractJson(raw) as Record<string, unknown>;
      return { locations: parseLocationsArray(data) };
    } catch {
      return reply
        .status(422)
        .send({ error: "LLM did not return valid JSON", raw });
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

    const { streamChat } = await import("../ollama.js");
    const charList = Array.isArray(characters)
      ? characters.map((c) => c.name).filter(Boolean)
      : [];

    const systemPrompt = [
      "You are a creative writing assistant. Your ONLY job is to output a single JSON object — nothing else.",
      "Do NOT write any explanation, commentary, or prose. Do NOT use markdown or code fences.",
      "Given a story concept, invent 2–4 backstory/origin events per character — things that happened BEFORE the story begins that shaped who they are.",
      "Focus on events with emotional weight: first meetings, formative traumas, key decisions, lost relationships.",
      ...(charList.length
        ? [`Characters in this story: ${charList.join(", ")}`]
        : []),
      "Output ONLY the raw JSON object below:",
      "{",
      '  "memories": [',
      "    {",
      '      "characterName": "string — must match one of the provided character names",',
      '      "summary": "string — one sentence describing the backstory event",',
      '      "tags": ["string"],',
      '      "importance": 0.0,',
      "      // importance 0.0–1.0: 0.9+ for defining moments, 0.6 for significant backstory, 0.4 for minor history",
      '      "deltas": {',
      "        // omit entire deltas object if no trait changes resulted from this event",
      '        "personality": { "add": ["new trait"], "remove": ["lost trait"] },',
      '        "fears": { "add": ["new fear"], "remove": ["resolved fear"] },',
      '        "speechStyle": "new speech style if this event changed it, otherwise omit",',
      '        "appearance": "new appearance if this event changed it, otherwise omit",',
      '        "relationships": [',
      "          {",
      '            "otherCharacterName": "string",',
      '            "emotion": "string",',
      '            "publicAttitude": "string",',
      '            "privateAttitude": "string",',
      '            "trustLevel": 5',
      "          }",
      "        ]",
      "        // include relationships only if this event changed how they feel about another character",
      "      }",
      "    }",
      "  ]",
      "  // ordered chronologically: earliest event first",
      "  // interleave characters naturally in timeline order",
      "}",
    ].join("\n");

    let raw = "";
    await streamChat({
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `${premise?.trim() ? `Story premise: ${premise.trim()}\n\n` : ""}Story concept:\n${concept.trim()}\n\nRespond with ONLY the JSON object. No other text.`,
        },
      ],
      temperature: 0.85,
      onChunk: (t) => {
        raw += t;
      },
    });

    try {
      const memories = normaliseMemoryDeltas(
        extractJson(raw) as Record<string, unknown>,
      );
      return { memories };
    } catch {
      return reply
        .status(422)
        .send({ error: "LLM did not return valid JSON", raw });
    }
  });

  // ─── Import from text (multi-step) ────────────────────────────────────────

  app.post("/stories/parse-story-core", async (req, reply) => {
    const { text } = req.body as { text?: string };
    if (!text?.trim())
      return reply.status(400).send({ error: "text is required" });

    const { streamChat } = await import("../ollama.js");
    const systemPrompt = [
      "You are a story metadata extractor. Your ONLY job is to output a single JSON object — nothing else.",
      "Do NOT extract characters or locations. Do NOT write any analysis, explanation, commentary, or prose. Do NOT use markdown or code fences.",
      "Read the story text. Synthesise a concise 2-4 sentence premise (do not copy verbatim). Extract metadata only.",
      "Output ONLY the raw JSON object below, with no text before or after it:",
      "{",
      '  "title": "string",',
      '  "premise": "string — synthesised 2-4 sentence premise",',
      '  "genres": ["string", ...],',
      `  // allowed genres: ${STORY_GENRES.join(", ")}`,
      '  "tone": ["string", ...],',
      `  // allowed tones: ${STORY_TONES.join(", ")}`,
      '  "rules": ["string", ...],',
      '  "writingStyle": "string"',
      "}",
    ].join("\n");

    let raw = "";
    await streamChat({
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Story text:\n${text.trim()}\n\nRespond with ONLY the JSON object. No other text.`,
        },
      ],
      temperature: 0.1,
      num_ctx: 8192,
      onChunk: (t) => {
        raw += t;
      },
    });

    try {
      const data = extractJson(raw) as Record<string, unknown>;
      return {
        title: typeof data.title === "string" ? data.title : "",
        premise: typeof data.premise === "string" ? data.premise : "",
        genres: Array.isArray(data.genres)
          ? data.genres.filter((x): x is string => typeof x === "string")
          : [],
        tone: Array.isArray(data.tone)
          ? data.tone.filter((x): x is string => typeof x === "string")
          : [],
        rules: Array.isArray(data.rules)
          ? data.rules.filter((x): x is string => typeof x === "string")
          : [],
        writingStyle:
          typeof data.writingStyle === "string" ? data.writingStyle : "",
      };
    } catch {
      return reply
        .status(422)
        .send({ error: "LLM did not return valid JSON", raw });
    }
  });

  app.post("/stories/parse-story-characters", async (req, reply) => {
    const { text, premise } = req.body as { text?: string; premise?: string };
    if (!text?.trim())
      return reply.status(400).send({ error: "text is required" });

    const { streamChat } = await import("../ollama.js");
    const systemPrompt = [
      "You are a character extractor. Your ONLY job is to output a single JSON object — nothing else.",
      "Do NOT write any analysis, explanation, commentary, or prose. Do NOT use markdown or code fences.",
      "Extract all named characters from the story text. Use the story premise as context.",
      "Also extract the initial relationships between characters as they appear at the start of the story.",
      "Output ONLY the raw JSON object below, with no text before or after it:",
      "{",
      '  "characters": [',
      "    {",
      '      "name": "string",',
      '      "role": "string",',
      '      "isUserPersona": false,',
      '      "age": "string",',
      '      "gender": "string",',
      '      "species": "string",',
      '      "clothing": "string",',
      '      "appearance": "string",',
      '      "personality": ["trait"],',
      '      "speechStyle": "string",',
      '      "trueMotives": "string",',
      '      "fears": ["fear"],',
      '      "relationships": [',
      "        {",
      '          "otherCharacterName": "string — must match another character\'s name exactly",',
      '          "emotion": "string — e.g. love, fear, rivalry, ally, hate, distrust, respect, neutral",',
      '          "publicAttitude": "string — how they visibly act toward this character",',
      '          "privateAttitude": "string — their hidden feelings toward this character",',
      '          "trustLevel": 5',
      "          // trustLevel 0-10: 0=no trust, 5=neutral, 10=complete trust",
      "        }",
      "      ]",
      "      // omit relationships array if the character has no notable relationships",
      "    }",
      "  ]",
      "}",
    ].join("\n");

    let raw = "";
    await streamChat({
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `${premise?.trim() ? `Story premise: ${premise.trim()}\n\n` : ""}Story text:\n${text.trim()}\n\nRespond with ONLY the JSON object. No other text.`,
        },
      ],
      temperature: 0.1,
      num_ctx: 8192,
      onChunk: (t) => {
        raw += t;
      },
    });

    try {
      const data = extractJson(raw) as Record<string, unknown>;
      return { characters: parseCharactersArray(data) };
    } catch {
      return reply
        .status(422)
        .send({ error: "LLM did not return valid JSON", raw });
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

    const { streamChat } = await import("../ollama.js");
    const charList = Array.isArray(characters)
      ? characters.map((c) => c.name).filter(Boolean)
      : [];
    const systemPrompt = [
      "You are a story event extractor. Your ONLY job is to output a single JSON object — nothing else.",
      "Do NOT write any analysis, explanation, commentary, or prose. Do NOT use markdown or code fences.",
      "Read the story text and extract key story events/turning points for each named character, in chronological order.",
      "For each event, also note any character trait changes (deltas) that resulted from it.",
      ...(charList.length
        ? [`Characters in this story: ${charList.join(", ")}`]
        : []),
      "Output ONLY the raw JSON object below, with no text before or after it:",
      "{",
      '  "memories": [',
      "    {",
      '      "characterName": "string — must match one of the provided character names",',
      '      "summary": "string — one sentence describing what happened to this character",',
      '      "tags": ["string"],',
      '      "importance": 0.0,',
      "      // importance 0.0–1.0: 0.9+ for major turning points, 0.6 for significant events, 0.4 for minor events",
      '      "deltas": {',
      "        // omit entire deltas object if no trait or relationship changes occurred",
      '        "personality": { "add": ["new trait"], "remove": ["lost trait"] },',
      '        "fears": { "add": ["new fear"], "remove": ["resolved fear"] },',
      '        "speechStyle": "new speech style if changed, otherwise omit",',
      '        "appearance": "new appearance if changed, otherwise omit",',
      '        "clothing": "new clothing if changed, otherwise omit",',
      '        "relationships": [',
      "          {",
      '            "otherCharacterName": "string — name of the other character involved",',
      '            "emotion": "string — e.g. love, fear, betrayal, ally, hate, distrust, respect",',
      '            "publicAttitude": "string — how they now visibly act toward this character",',
      '            "privateAttitude": "string — their hidden feelings after this event",',
      '            "trustLevel": 5',
      "          }",
      "        ]",
      "        // include relationships only if this event changed how the character feels about another",
      "      }",
      "    }",
      "  ]",
      "  // ordered chronologically: earliest event first",
      "  // include 3-8 events per character, only include events with importance >= 0.4",
      "  // interleave characters naturally in timeline order",
      "}",
    ].join("\n");

    let raw = "";
    await streamChat({
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `${premise?.trim() ? `Story premise: ${premise.trim()}\n\n` : ""}Story text:\n${text.trim()}\n\nRespond with ONLY the JSON object. No other text.`,
        },
      ],
      temperature: 0.1,
      num_ctx: 8192,
      onChunk: (t) => {
        raw += t;
      },
    });

    try {
      const memories = normaliseMemoryDeltas(
        extractJson(raw) as Record<string, unknown>,
      );
      return { memories };
    } catch {
      return reply
        .status(422)
        .send({ error: "LLM did not return valid JSON", raw });
    }
  });

  app.post("/stories/parse-story-locations", async (req, reply) => {
    const { text, premise } = req.body as { text?: string; premise?: string };
    if (!text?.trim())
      return reply.status(400).send({ error: "text is required" });

    const { streamChat } = await import("../ollama.js");
    const systemPrompt = [
      "You are a location extractor. Your ONLY job is to output a single JSON object — nothing else.",
      "Do NOT write any analysis, explanation, commentary, or prose. Do NOT use markdown or code fences.",
      "Extract all distinct locations and settings from the story text. Use the story premise as context.",
      "Output ONLY the raw JSON object below, with no text before or after it:",
      "{",
      '  "locations": [',
      "    {",
      '      "name": "string",',
      '      "description": "string",',
      '      "layout": "string",',
      '      "lighting": "string",',
      '      "atmosphere": "string",',
      '      "soundscape": "string",',
      '      "smells": "string",',
      '      "notes": "string",',
      '      "tags": ["string"]',
      "    }",
      "  ]",
      "}",
    ].join("\n");

    let raw = "";
    await streamChat({
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `${premise?.trim() ? `Story premise: ${premise.trim()}\n\n` : ""}Story text:\n${text.trim()}\n\nRespond with ONLY the JSON object. No other text.`,
        },
      ],
      temperature: 0.1,
      num_ctx: 8192,
      onChunk: (t) => {
        raw += t;
      },
    });

    try {
      const data = extractJson(raw) as Record<string, unknown>;
      return { locations: parseLocationsArray(data) };
    } catch {
      return reply
        .status(422)
        .send({ error: "LLM did not return valid JSON", raw });
    }
  });

  // ─── Import from text (legacy monolithic) ────────────────────────────────

  app.post("/stories/parse-text", async (req, reply) => {
    const { text } = req.body as { text?: string };
    if (!text?.trim())
      return reply.status(400).send({ error: "text is required" });

    const { streamChat } = await import("../ollama.js");
    const systemPrompt = [
      "You are a story metadata extractor. Your ONLY job is to output a single JSON object — nothing else.",
      "Do NOT write any analysis, explanation, commentary, or prose. Do NOT use markdown. Do NOT use code fences.",
      "Read the provided story text. Synthesise a concise 2-4 sentence premise (do not copy verbatim). Extract characters and locations.",
      "Output ONLY the raw JSON object below, with no text before or after it:",
      "{",
      '  "title": "string",',
      '  "premise": "string — synthesised 2-4 sentence premise",',
      '  "genres": ["string", ...],',
      `  // allowed genres: ${STORY_GENRES.join(", ")}`,
      '  "tone": ["string", ...],',
      `  // allowed tones: ${STORY_TONES.join(", ")}`,
      '  "rules": ["string", ...],',
      '  "writingStyle": "string",',
      '  "characters": [',
      "    {",
      '      "name": "string",',
      '      "role": "string",',
      '      "isUserPersona": false,',
      '      "age": "string",',
      '      "gender": "string",',
      '      "species": "string",',
      '      "clothing": "string",',
      '      "appearance": "string",',
      '      "personality": ["trait"],',
      '      "speechStyle": "string",',
      '      "trueMotives": "string",',
      '      "fears": ["fear"]',
      "    }",
      "  ],",
      '  "locations": [',
      "    {",
      '      "name": "string",',
      '      "description": "string",',
      '      "layout": "string",',
      '      "lighting": "string",',
      '      "atmosphere": "string",',
      '      "soundscape": "string",',
      '      "smells": "string",',
      '      "notes": "string",',
      '      "tags": ["string"]',
      "    }",
      "  ]",
      "}",
    ].join("\n");

    let raw = "";
    await streamChat({
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Story text:\n${text.trim()}\n\nRespond with ONLY the JSON object. No other text.`,
        },
      ],
      temperature: 0.1,
      num_ctx: 8192,
      onChunk: (t) => {
        raw += t;
      },
    });

    try {
      const data = extractJson(raw) as Record<string, unknown>;
      return {
        title: typeof data.title === "string" ? data.title : "",
        premise: typeof data.premise === "string" ? data.premise : "",
        genres: Array.isArray(data.genres)
          ? data.genres.filter((x): x is string => typeof x === "string")
          : [],
        tone: Array.isArray(data.tone)
          ? data.tone.filter((x): x is string => typeof x === "string")
          : [],
        rules: Array.isArray(data.rules)
          ? data.rules.filter((x): x is string => typeof x === "string")
          : [],
        writingStyle:
          typeof data.writingStyle === "string" ? data.writingStyle : "",
        characters: parseCharactersArray(data),
        locations: parseLocationsArray(data),
      };
    } catch {
      return reply
        .status(422)
        .send({ error: "LLM did not return valid JSON", raw });
    }
  });

  // ─── Stories CRUD ─────────────────────────────────────────────────────────

  app.get("/stories", async () => {
    return storage.listStories();
  });

  app.get<{ Params: { id: string } }>("/stories/:id", async (req, reply) => {
    const story = await storage.getStory(req.params.id);
    if (!story) return reply.status(404).send({ error: "Story not found" });
    const characters = await storage.listCharacters(req.params.id);
    const locations = await storage.listLocations(req.params.id);
    return { story, characters, locations };
  });

  app.post("/stories", async (req, reply) => {
    const body = StoryCreateSchema.safeParse(req.body);
    if (!body.success)
      return reply.status(400).send({ error: body.error.flatten() });
    const story = await storage.createStory(body.data);
    return reply.status(201).send(story);
  });

  app.patch<{ Params: { id: string } }>("/stories/:id", async (req, reply) => {
    const body = StoryUpdateSchema.safeParse(req.body);
    if (!body.success)
      return reply.status(400).send({ error: body.error.flatten() });
    const story = await storage.updateStory(req.params.id, body.data);
    if (!story) return reply.status(404).send({ error: "Story not found" });
    return story;
  });

  app.delete<{ Params: { id: string } }>("/stories/:id", async (req, reply) => {
    const ok = await storage.deleteStory(req.params.id);
    if (!ok) return reply.status(404).send({ error: "Story not found" });
    return { ok: true };
  });

  // ─── Supporting field generation ──────────────────────────────────────────

  app.post<{ Params: { id: string } }>(
    "/stories/:id/generate-supporting",
    async (req, reply) => {
      const story = await storage.getStory(req.params.id);
      if (!story) return reply.status(404).send({ error: "Story not found" });
      if (!story.premise?.trim())
        return reply
          .status(400)
          .send({ error: "Story has no premise to generate from" });

      const { streamChat } = await import("../ollama.js");
      const systemPrompt = [
        "You are a creative writing assistant. Return ONLY valid JSON — no explanation, no markdown, no code fences.",
        "Given a story premise, regenerate the supporting metadata fields.",
        "Return exactly this JSON shape:",
        "{",
        '  "genres": ["string", ...],',
        `  // allowed genres: ${STORY_GENRES.join(", ")}`,
        '  "tone": ["string", ...],',
        `  // allowed tones: ${STORY_TONES.join(", ")}`,
        '  "rules": ["string", ...],',
        '  "writingStyle": "string"',
        "}",
      ].join("\n");

      let raw = "";
      await streamChat({
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Story: "${story.title}"\n\nPremise:\n${story.premise.trim()}`,
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
          genres: Array.isArray(data.genres)
            ? data.genres.filter((x): x is string => typeof x === "string")
            : [],
          tone: Array.isArray(data.tone)
            ? data.tone.filter((x): x is string => typeof x === "string")
            : [],
          rules: Array.isArray(data.rules)
            ? data.rules.filter((x): x is string => typeof x === "string")
            : [],
          writingStyle:
            typeof data.writingStyle === "string" ? data.writingStyle : "",
        };
      } catch {
        return reply
          .status(422)
          .send({ error: "LLM did not return valid JSON", raw });
      }
    },
  );

  // ─── AI Single-Field Autofill (legacy) ───────────────────────────────────

  app.post<{ Params: { id: string } }>(
    "/stories/:id/autofill",
    async (req, reply) => {
      const { field, context } = req.body as { field: string; context: string };
      if (!field) return reply.status(400).send({ error: "field is required" });

      const { streamChat } = await import("../ollama.js");
      const prompt = `You are a creative writing assistant. Based on the following context, generate content for the "${field}" field of a roleplay story. Return only the generated content, no explanation.\n\nContext:\n${context ?? ""}\n\nGenerate ${field}:`;

      let result = "";
      await streamChat({
        messages: [{ role: "user", content: prompt }],
        temperature: 0.9,
        onChunk: (text) => {
          result += text;
        },
      });
      return { field, result: result.trim() };
    },
  );
}
