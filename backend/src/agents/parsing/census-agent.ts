import { LLMAgent } from "../generate.js";

export const censusAgent = new LLMAgent({
  role: "story entity census",
  instructions: [
    "List every named entity in the story text. Do not describe them — enumerate names only.",
    "characterNames: every named person, creature, or being.",
    "locationNames: every named place, realm, room, or setting.",
    "sceneNames: every scene or act title found in the text (look for delimiter lines like —Scene Name—).",
    "If no scene delimiters exist, infer scene names from major location or event transitions.",
  ].join(" "),
  outputShape: [
    "{",
    '  "characterNames": ["string"],',
    '  "locationNames": ["string"],',
    '  "sceneNames": ["string"]',
    "}",
  ].join("\n"),
  temperature: 0.1,
  num_ctx: 8192,
});
