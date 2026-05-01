import { z } from "zod";
import { createPromptRunner } from "../../LLM/prompt-runners/create-prompt-runner";

const relationshipSchema = z.object({
  otherCharacterName: z.string(),
  emotion: z.string().optional().default(""),
  publicAttitude: z.string().optional().default(""),
  privateAttitude: z.string().optional().default(""),
  trustLevel: z.number().optional().default(5),
});

export const storyCharactersParseAgent = createPromptRunner({
  role: "character extractor",
  instructions:
    "Extract all named characters from the story text. Use the story premise as context. Also extract the initial relationships between characters as they appear at the start of the story. trustLevel is an integer 0–10 (0=no trust, 5=neutral, 10=complete trust). Omit the relationships array entirely if the character has no notable relationships.",
  outputSchema: z.object({
    characters: z.array(
      z.object({
        name: z.string(),
        role: z.string().optional().default(""),
        isUserPersona: z.boolean().optional().default(false),
        age: z.string().optional().default(""),
        gender: z.string().optional().default(""),
        species: z.string().optional().default("human"),
        clothing: z.string().optional().default(""),
        appearance: z.string().optional().default(""),
        personality: z.array(z.string()).optional().default([]),
        speechStyle: z.string().optional().default(""),
        trueMotives: z.string().optional().default(""),
        fears: z.array(z.string()).optional().default([]),
        relationships: z.array(relationshipSchema).optional().default([]),
      }),
    ),
  }),
  temperature: 0.1,
  num_ctx: 8192,
});

export const characterDeepDiveAgent = createPromptRunner({
  role: "character analyst",
  instructions: [
    "You are given a complete story text and a single character name. Extract EVERYTHING the text reveals about that character.",
    "Do not write 'Unknown'. If it is in the text, extract it.",
    "For identities: list each distinct form or persona the character has (e.g. human disguise vs true form).",
    "selfAware is true if the character knows about that identity.",
    "linkedCharacterNames lists other character names who are the same entity at a different point in time or under a different name.",
    "Only include linkedCharacterNames if the text explicitly confirms the link.",
    "Personality, fears, and privateKnowledge reflect the character AT THE START of the story (before any events change them).",
  ].join(" "),
  outputSchema: z.object({
    name: z.string(),
    role: z.string().optional().default(""),
    age: z.string().optional().default(""),
    gender: z.string().optional().default(""),
    species: z.string().optional().default("human"),
    clothing: z.string().optional().default(""),
    appearance: z.string().optional().default(""),
    personality: z.array(z.string()).optional().default([]),
    speechStyle: z.string().optional().default(""),
    trueMotives: z.string().optional().default(""),
    fears: z.array(z.string()).optional().default([]),
    moralLimits: z.string().optional().default(""),
    hiddenEmotionalState: z.string().optional().default(""),
    privateKnowledge: z.array(z.string()).optional().default([]),
    identities: z
      .array(
        z.object({
          name: z.string(),
          appearance: z.string().optional().default(""),
          abilities: z.array(z.string()).optional().default([]),
          selfAware: z.boolean().optional().default(false),
          knownBy: z.array(z.string()).optional().default([]),
          conditions: z.string().optional().default(""),
          notes: z.string().optional().default(""),
        }),
      )
      .optional()
      .default([]),
    linkedCharacterNames: z.array(z.string()).optional().default([]),
  }),
  temperature: 0.2,
  num_ctx: 8192,
});
