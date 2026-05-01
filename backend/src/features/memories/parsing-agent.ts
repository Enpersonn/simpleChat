import { z } from "zod";
import { createPromptRunner } from "../../LLM/prompt-runners/create-prompt-runner";

export const storyMemoriesParseAgent = createPromptRunner({
  role: "story event extractor",
  instructions: [
    "Read the story text and extract key story events/turning points for each named character, in chronological order (earliest event first, storyOrder starting at 1). Include 3-8 events per character; only include events with importance >= 0.4. Interleave characters naturally in timeline order.",
    "importance is a float 0.0–1.0: use 0.9+ for major turning points, 0.7 for character-defining events, 0.4-0.69 for plot events.",
    "sceneId is the name of the scene or act this event belongs to (use the scene delimiter text if present).",
    "For effects: list only fields that CHANGED as a result of this event, using the exact dot-path (e.g. public.personality, private.hiddenEmotionalState, private.fears, relationships). Use op 'add' or 'remove' for arrays, 'set' for strings. Omit effects entirely if nothing changed.",
    "entityType is always 'character'. targetId is only needed for relationship path effects.",
  ].join(" "),
  outputSchema: z.object({
    memories: z.array(
      z.object({
        characterName: z.string(),
        summary: z.string(),
        tags: z.array(z.string()).optional().default([]),
        importance: z.number(),
        sceneId: z.string().nullable().optional().default(null),
        storyOrder: z.number(),
        effects: z
          .array(
            z.object({
              path: z.string(),
              op: z.string(),
              value: z.unknown().optional(),
              weight: z.number().optional().default(1),
              entityType: z.string().optional().default("character"),
              targetId: z.string().optional(),
            }),
          )
          .optional()
          .default([]),
      }),
    ),
  }),
  temperature: 0.1,
  num_ctx: 8192,
});
