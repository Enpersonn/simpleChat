import { z } from "zod";
import { createPromptRunner } from "../../LLM/prompt-runners/create-prompt-runner";

const characterSchema = z.object({
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
});

export const characterAgent = createPromptRunner({
  role: "character creator for collaborative fiction",
  instructions:
    "Given a character description and optional story context, generate a complete character profile.",
  outputSchema: characterSchema,
  temperature: 0.85,
});

export const storyCharactersAgent = createPromptRunner({
  role: "character creator for collaborative fiction",
  instructions:
    "Given a story concept and its established style, create the characters for the story. Extract named characters from the concept; create 1–3 if none are named. If provided with a list of existing character names, do not create duplicates. Set isUserPersona: true only if this is explicitly the player/user character. Omit the relationships array if the character has no notable relationships. trustLevel 0-10: 0=no trust, 5=neutral, 10=complete trust.",
  outputSchema: z.object({
    characters: z.array(
      characterSchema.extend({
        isUserPersona: z.boolean().optional().default(false),
        relationships: z
          .array(
            z.object({
              otherCharacterName: z.string(),
              emotion: z.string().optional().default(""),
              publicAttitude: z.string().optional().default(""),
              privateAttitude: z.string().optional().default(""),
              trustLevel: z.number().optional().default(5),
            }),
          )
          .optional()
          .default([]),
      }),
    ),
  }),
  temperature: 0.85,
});
