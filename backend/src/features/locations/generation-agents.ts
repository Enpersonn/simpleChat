import { LLMAgent } from "../../LLM/generate";

export const locationAgent = new LLMAgent({
  role: "location designer for collaborative fiction",
  instructions:
    "Given a location description and optional story context, generate a complete location profile.",
  outputShape: [
    "{",
    '  "name": "string",',
    '  "description": "string (1-2 sentences overview)",',
    '  "layout": "string (spatial description: size, shape, exits, notable features)",',
    '  "lighting": "string (quality and source of light)",',
    '  "atmosphere": "string (mood, feel, emotional tone)",',
    '  "soundscape": "string (ambient sounds)",',
    '  "smells": "string (scents, odors)",',
    '  "notes": "string (consistency rules for authors, e.g. always cold, low ceilings)",',
    '  "tags": ["tag1", "tag2"]',
    "}",
  ].join("\n"),
  temperature: 0.85,
});

export const storyLocationsAgent = new LLMAgent({
  role: "world-builder for collaborative fiction",
  instructions:
    "Given a story concept and its established style, invent 2–4 compelling, distinct locations that fit this story world.",
  outputShape: [
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
  ].join("\n"),
  temperature: 0.85,
});
