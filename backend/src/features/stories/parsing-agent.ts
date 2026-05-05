import { z } from 'zod';
import { createPromptRunner } from '../../LLM/prompt-runners/create-prompt-runner';
import { STORY_GENRES, STORY_TONES } from '.';

export const storyCoreParseAgent = createPromptRunner({
	role: 'story metadata extractor',
	instructions: [
		'Read the story text. Synthesise a concise 2-4 sentence premise (do not copy verbatim). Extract metadata only. Do NOT extract characters or locations.',
		`Allowed genres (use only these): ${STORY_GENRES.join(', ')}.`,
		`Allowed tones (use only these): ${STORY_TONES.join(', ')}.`,
		'For writingStyle, fill all five sub-fields based on evidence in the text.',
		'For rules, separate world physics (worldRules), narrative demands (storyRules), and per-character constraints (characterRules).',
		'themes are the core thematic concerns of the story (e.g. redemption, identity, sacrifice).',
	].join(' '),
	outputSchema: z.object({
		title: z.string(),
		premise: z.string(),
		genres: z.array(z.string()),
		tone: z.array(z.string()),
		themes: z.array(z.string()).optional().default([]),
		writingStyle: z
			.object({
				prose: z.string().optional().default(''),
				interiority: z.string().optional().default(''),
				dialogue: z.string().optional().default(''),
				pacing: z.string().optional().default(''),
				sensory: z.string().optional().default(''),
			})
			.optional(),
		rules: z
			.object({
				worldRules: z.array(z.string()).optional().default([]),
				storyRules: z.array(z.string()).optional().default([]),
				characterRules: z.array(z.string()).optional().default([]),
			})
			.optional(),
	}),
	temperature: 0.1,
	num_ctx: 8192,
});
