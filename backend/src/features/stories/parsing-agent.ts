import { LLMAgent } from "../../generate";
import { STORY_GENRES, STORY_TONES } from ".";

export const storyCoreParseAgent = new LLMAgent({
  role: "story metadata extractor",
  instructions:
    "Read the story text. Synthesise a concise 2-4 sentence premise (do not copy verbatim). Extract metadata only. Do NOT extract characters or locations.",
  outputShape: [
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
  ].join("\n"),
  temperature: 0.1,
  num_ctx: 8192,
});
