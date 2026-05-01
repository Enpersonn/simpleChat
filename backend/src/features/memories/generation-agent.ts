import { z } from "zod";
import { createPromptRunner } from "../../LLM/prompt-runners/create-prompt-runner";

const relationshipSchema = z.object({
  otherCharacterName: z.string(),
  emotion: z.string().optional().default(""),
  publicAttitude: z.string().optional().default(""),
  privateAttitude: z.string().optional().default(""),
  trustLevel: z.number().optional().default(5),
});

export const storyMemoriesAgent = createPromptRunner({
  role: "backstory writer for collaborative fiction",
  instructions:
    "Given a story concept, invent 2–4 backstory/origin events per character — things that happened BEFORE the story begins that shaped who they are. Focus on events with emotional weight: first meetings, formative traumas, key decisions, lost relationships. Order events chronologically, interleave characters naturally. importance 0.0–1.0: 0.9+ for defining moments, 0.6 for significant backstory, 0.4 for minor history. Omit the deltas object entirely if no trait changes resulted from the event. Include relationships in deltas only if the event changed how a character feels about another.",
  outputSchema: z.object({
    memories: z.array(
      z.object({
        characterName: z.string(),
        summary: z.string(),
        tags: z.array(z.string()).optional().default([]),
        importance: z.number(),
        deltas: z
          .object({
            personality: z
              .object({
                add: z.array(z.string()).optional().default([]),
                remove: z.array(z.string()).optional().default([]),
              })
              .optional(),
            fears: z
              .object({
                add: z.array(z.string()).optional().default([]),
                remove: z.array(z.string()).optional().default([]),
              })
              .optional(),
            speechStyle: z.string().optional(),
            appearance: z.string().optional(),
            relationships: z.array(relationshipSchema).optional().default([]),
          })
          .optional(),
      }),
    ),
  }),
  temperature: 0.85,
});
