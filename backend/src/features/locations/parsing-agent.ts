import { LLMAgent } from "../../generate";

export const storyLocationsParseAgent = new LLMAgent({
  role: "location extractor",
  instructions:
    "Extract all distinct locations and settings from the story text. Use the story premise as context.",
  outputShape: [
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
  ].join("\n"),
  temperature: 0.1,
  num_ctx: 8192,
});
