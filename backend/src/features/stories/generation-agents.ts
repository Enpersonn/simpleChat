import { z } from "zod";
import { createPromptRunner } from "../../LLM/prompt-runners/create-prompt-runner";
import { STORY_GENRES, STORY_TONES } from ".";

export const storyCoreAgent = createPromptRunner({
  role: "creative writing assistant",
  instructions: `Given a story concept, generate the story metadata only. Do NOT write characters. Include a title. Allowed genres: ${STORY_GENRES.join(", ")}. Allowed tones: ${STORY_TONES.join(", ")}. Include 2-4 world rules as short sentences. writingStyle is one sentence describing narrative style.`,
  outputSchema: z.object({
    title: z.string(),
    genres: z.array(z.string()),
    tone: z.array(z.string()),
    rules: z.array(z.string()),
    writingStyle: z.string(),
  }),
  temperature: 0.85,
});

export const dmProposalExtractorAgent = createPromptRunner({
  role: "story entity extractor",
  instructions: [
    "Analyze the DM's story planning response and extract any concrete proposals to add a character, location, or character backstory memory.",
    "A proposal is when the DM describes a specific entity in enough detail to create it.",
    "If the DM mentions an entity that already exists (listed in the story context), do NOT propose it.",
    'If there are no concrete proposals, return { "proposals": [] }.',
    "For character entityData include: name (string), role (string), public.age, public.gender, public.species, public.appearance, public.personality (array of traits), public.speechStyle, public.clothing, private.trueMotives, private.fears (array).",
    "For location entityData include: name, description, layout, lighting, atmosphere, soundscape, smells, notes, tags (array).",
    "For memory entityData include: characterName (must match an existing character name), summary (one sentence), tags (array), importance (0.0-1.0).",
  ].join(" "),
  outputSchema: z.object({
    proposals: z.array(
      z.object({
        id: z.string(),
        type: z.enum(["character", "location", "memory"]),
        rationale: z.string(),
        entityData: z.record(z.unknown()),
      }),
    ),
  }),
  temperature: 0.1,
});

export const supportingFieldsAgent = createPromptRunner({
  role: "creative writing assistant",
  instructions: `Given a story title and premise, regenerate the supporting metadata fields (genres, tone, rules, writing style). Do NOT write characters or locations. Allowed genres: ${STORY_GENRES.join(", ")}. Allowed tones: ${STORY_TONES.join(", ")}.`,
  outputSchema: z.object({
    genres: z.array(z.string()),
    tone: z.array(z.string()),
    rules: z.array(z.string()),
    writingStyle: z.string(),
  }),
  temperature: 0.85,
});
