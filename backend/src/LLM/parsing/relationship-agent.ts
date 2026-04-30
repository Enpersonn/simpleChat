import { createPromptRunner } from "../prompt-runners/create-prompt-runner.js";

export const relationshipAgent = createPromptRunner({
  role: "character relationship extractor",
  instructions: [
    "For each character pair that shares a scene, extract their relationship as it stands AT THE START of the story.",
    "Only include pairs where there is meaningful relationship information in the text.",
    "trustLevel is an integer 0–10 (0=no trust, 5=neutral, 10=complete trust).",
    "fromCharacter and toCharacter must match character names exactly.",
  ].join(" "),
  outputShape: [
    "{",
    '  "relationships": [',
    "    {",
    '      "fromCharacter": "string",',
    '      "toCharacter": "string",',
    '      "emotion": "string — e.g. love, fear, rivalry, ally, hate, distrust, respect, neutral",',
    '      "publicAttitude": "string — how fromCharacter visibly acts toward toCharacter",',
    '      "privateAttitude": "string — fromCharacter hidden feelings",',
    '      "trustLevel": 5',
    "    }",
    "  ]",
    "}",
  ].join("\n"),
  temperature: 0.1,
  num_ctx: 8192,
});
