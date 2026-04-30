import { LLMAgent } from "../../LLM/generate";
import { createPromptRunner } from "../../LLM/prompt-runners/create-prompt-runner";

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
export const characterPromptRunner = createPromptRunner({
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
