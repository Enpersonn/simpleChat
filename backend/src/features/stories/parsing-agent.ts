import { z } from 'zod';
import { createPromptRunner } from '../../LLM/prompt-runners/create-prompt-runner';
import { STORY_GENRES, STORY_TONES } from '.';

export const storyCoreParseAgent = createPromptRunner({
	instructions: [
		'Read the story text. Synthesise a concise 2-4 sentence premise (do not copy verbatim). Extract metadata only. Do NOT extract characters or locations.',
		`Allowed genres (use only these): ${STORY_GENRES.join(', ')}.`,
		`Allowed tones (use only these): ${STORY_TONES.join(', ')}.`,
		'For writingStyle, fill all five sub-fields based on evidence in the text.',
		'For rules, separate world physics (worldRules), narrative demands (storyRules), and per-character constraints (characterRules).',
		'themes are the core thematic concerns of the story (e.g. redemption, identity, sacrifice).',
	].join(' '),
	num_ctx: 8192,
	outputSchema: z.object({
		genres: z.array(z.string()),
		premise: z.string(),
		rules: z
			.object({
				characterRules: z.array(z.string()).optional().default([]),
				storyRules: z.array(z.string()).optional().default([]),
				worldRules: z.array(z.string()).optional().default([]),
			})
			.optional(),
		themes: z.array(z.string()).optional().default([]),
		title: z.string(),
		tone: z.array(z.string()),
		writingStyle: z
			.object({
				dialogue: z.string().optional().default(''),
				interiority: z.string().optional().default(''),
				pacing: z.string().optional().default(''),
				prose: z.string().optional().default(''),
				sensory: z.string().optional().default(''),
			})
			.optional(),
	}),
	role: 'story metadata extractor',
	temperature: 0.1,
});
