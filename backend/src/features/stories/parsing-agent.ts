import { createPromptRunner } from "../../LLM/prompt-runners/create-prompt-runner";
import { STORY_GENRES, STORY_TONES } from ".";

export const storyCoreParseAgent = createPromptRunner({
  role: "story metadata extractor",
  instructions: [
    "Read the story text. Synthesise a concise 2-4 sentence premise (do not copy verbatim). Extract metadata only. Do NOT extract characters or locations.",
    `Allowed genres (use only these): ${STORY_GENRES.join(", ")}.`,
    `Allowed tones (use only these): ${STORY_TONES.join(", ")}.`,
    "For writingStyle, fill all five sub-fields based on evidence in the text.",
    "For rules, separate world physics (worldRules), narrative demands (storyRules), and per-character constraints (characterRules).",
    "themes are the core thematic concerns of the story (e.g. redemption, identity, sacrifice).",
  ].join(" "),
  outputShape: [
    "{",
    '  "title": "string",',
    '  "premise": "string — synthesised 2-4 sentence premise",',
    '  "genres": ["string", ...],',
    '  "tone": ["string", ...],',
    '  "themes": ["string", ...],',
    '  "writingStyle": {',
    '    "prose": "sentence rhythm and density",',
    '    "interiority": "depth of internal monologue",',
    '    "dialogue": "style of speech",',
    '    "pacing": "scene rhythm",',
    '    "sensory": "dominant senses and details"',
    "  },",
    '  "rules": {',
    '    "worldRules": ["physics of the universe that always apply"],',
    '    "storyRules": ["what this narrative demands of its characters"],',
    '    "characterRules": ["per-story constraints on specific characters"]',
    "  }",
    "}",
  ].join("\n"),
  temperature: 0.1,
  num_ctx: 8192,
});
