import { LLMAgent } from "../generate.js";

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

export const storyCoreAgent = new LLMAgent({
  role: "creative writing assistant",
  instructions:
    "Given a story concept, generate the story metadata only. Do NOT write characters. Include a title.",
  outputShape: [
    "{",
    '  "title": "string",',
    '  "genres": ["string", ...],',
    `  // allowed genres: ${STORY_GENRES.join(", ")}`,
    '  "tone": ["string", ...],',
    `  // allowed tones: ${STORY_TONES.join(", ")}`,
    '  "rules": ["string", ...],',
    "  // 2-4 world rules as short sentences",
    '  "writingStyle": "string"',
    "  // one sentence describing narrative style",
    "}",
  ].join("\n"),
  temperature: 0.85,
});

export const storyCharactersAgent = new LLMAgent({
  role: "character creator for collaborative fiction",
  instructions:
    "Given a story concept and its established style, create the characters for the story. Extract named characters from the concept; create 1–3 if none are named. If provided with a list of existing character names, do not create duplicates.",
  outputShape: [
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

export const storyMemoriesAgent = new LLMAgent({
  role: "backstory writer for collaborative fiction",
  instructions:
    "Given a story concept, invent 2–4 backstory/origin events per character — things that happened BEFORE the story begins that shaped who they are. Focus on events with emotional weight: first meetings, formative traumas, key decisions, lost relationships. Order events chronologically, interleave characters naturally.",
  outputShape: [
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
  ].join("\n"),
  temperature: 0.85,
});

export const characterAgent = new LLMAgent({
  role: "character creator for collaborative fiction",
  instructions:
    "Given a character description and optional story context, generate a complete character profile.",
  outputShape: [
    "{",
    '  "name": "string",',
    '  "role": "string (title or occupation)",',
    '  "age": "string (e.g. \\"mid-30s\\" or \\"ancient\\")",',
    '  "gender": "string",',
    '  "species": "string (e.g. human, wolf, android — default human)",',
    '  "clothing": "string (brief outfit description)",',
    '  "appearance": "string (2-3 sentences of physical description)",',
    '  "personality": ["trait1", "trait2"],',
    '  "speechStyle": "string (one sentence)",',
    '  "trueMotives": "string (hidden goal, 1-2 sentences)",',
    '  "fears": ["fear1", "fear2"]',
    "}",
  ].join("\n"),
  temperature: 0.85,
});

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

export const dmProposalExtractorAgent = new LLMAgent({
  role: "story entity extractor",
  instructions: [
    "Analyze the DM's story planning response and extract any concrete proposals to add a character, location, or character backstory memory.",
    "A proposal is when the DM describes a specific entity in enough detail to create it.",
    "If the DM mentions an entity that already exists (listed in the story context), do NOT propose it.",
    "If there are no concrete proposals, return { \"proposals\": [] }.",
    "For character entityData include: name (string), role (string), public.age, public.gender, public.species, public.appearance, public.personality (array of traits), public.speechStyle, public.clothing, private.trueMotives, private.fears (array).",
    "For location entityData include: name, description, layout, lighting, atmosphere, soundscape, smells, notes, tags (array).",
    "For memory entityData include: characterName (must match an existing character name), summary (one sentence), tags (array), importance (0.0-1.0).",
  ].join(" "),
  outputShape: [
    "{",
    '  "proposals": [',
    "    {",
    '      "id": "generated-uuid",',
    '      "type": "character|location|memory",',
    '      "rationale": "one sentence: why this entity fits the story",',
    '      "entityData": { /* fields for the entity type as described above */ }',
    "    }",
    "  ]",
    "}",
  ].join("\n"),
  temperature: 0.1,
});

export const supportingFieldsAgent = new LLMAgent({
  role: "creative writing assistant",
  instructions:
    "Given a story title and premise, regenerate the supporting metadata fields (genres, tone, rules, writing style). Do NOT write characters or locations.",
  outputShape: [
    "{",
    '  "genres": ["string", ...],',
    `  // allowed genres: ${STORY_GENRES.join(", ")}`,
    '  "tone": ["string", ...],',
    `  // allowed tones: ${STORY_TONES.join(", ")}`,
    '  "rules": ["string", ...],',
    '  "writingStyle": "string"',
    "}",
  ].join("\n"),
  temperature: 0.85,
});
