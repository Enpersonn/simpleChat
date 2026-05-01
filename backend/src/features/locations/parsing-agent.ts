import { z } from "zod";
import { createPromptRunner } from "../../LLM/prompt-runners/create-prompt-runner";

export const storyLocationsParseAgent = createPromptRunner({
  role: "location extractor",
  instructions: [
    "Extract all distinct locations and settings from the story text. Use the story premise as context.",
    "Identify spatial containment: if one location is physically inside another, set parentLocationName to the containing location's name.",
    "Root locations (realms, cities, buildings) have parentLocationName: null.",
    "Sub-locations (rooms, corridors, stages) have the name of their containing location.",
    "Only create a child location if it is clearly distinct from its parent.",
    "connectedLocationNames lists locations reachable via a path, door, or portal (non-hierarchical connections).",
  ].join(" "),
  outputSchema: z.object({
    locations: z.array(
      z.object({
        name: z.string(),
        description: z.string().optional().default(""),
        layout: z.string().optional().default(""),
        lighting: z.string().optional().default(""),
        atmosphere: z.string().optional().default(""),
        soundscape: z.string().optional().default(""),
        smells: z.string().optional().default(""),
        notes: z.string().optional().default(""),
        tags: z.array(z.string()).optional().default([]),
        parentLocationName: z.string().nullable().optional().default(null),
        connectedLocationNames: z.array(z.string()).optional().default([]),
      }),
    ),
  }),
  temperature: 0.1,
  num_ctx: 8192,
});
