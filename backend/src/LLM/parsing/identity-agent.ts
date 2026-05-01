import { z } from "zod";
import { createPromptRunner } from "../prompt-runners/create-prompt-runner.js";

export const identityAgent = createPromptRunner({
  role: "character identity resolver",
  instructions: [
    "Given a character list and story timeline, identify characters who are the same entity under a different name or at a different point in time.",
    "Only create a link when the text explicitly confirms it (not speculation).",
    "identities lists distinct forms or personas for a character (e.g. human disguise vs true form).",
    "selfAware is true if the character knows they have this identity.",
    "conditions describes when/how this identity manifests.",
    "linkedCharacterNames are other character names who ARE the same entity.",
    "Only include entries where there is at least one identity or one link to report.",
  ].join(" "),
  outputSchema: z.object({
    links: z.array(
      z.object({
        characterName: z.string(),
        linkedCharacterNames: z.array(z.string()),
        identities: z
          .array(
            z.object({
              name: z.string(),
              selfAware: z.boolean(),
              conditions: z.string().optional(),
              appearance: z.string().optional(),
              abilities: z.array(z.string()),
              notes: z.string().optional(),
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
