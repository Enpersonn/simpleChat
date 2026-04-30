import { LLMAgent } from "../../agents/generate";
import { STORY_GENRES, STORY_TONES } from ".";

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

export const dmProposalExtractorAgent = new LLMAgent({
  role: "story entity extractor",
  instructions: [
    "Analyze the DM's story planning response and extract any concrete proposals to add a character, location, or character backstory memory.",
    "A proposal is when the DM describes a specific entity in enough detail to create it.",
    "If the DM mentions an entity that already exists (listed in the story context), do NOT propose it.",
    'If there are no concrete proposals, return { "proposals": [] }.',
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
