import { z } from 'zod';
import { createPromptRunner } from '../../LLM/prompt-runners/create-prompt-runner.js';
import { STORY_GENRES, STORY_TONES } from './index.js';

export const storyCoreClueParseAgent = createPromptRunner({
	instructions: [
		'Read this chunk of story text and extract chunk-local story core clues only.',
		'Do not try to produce the final full story metadata for the whole work. Extract only the evidence visible in this chunk.',
		'Summarise premiseClues as 1-3 short factual story observations from this chunk, not a polished final premise.',
		'titleCandidates should include any plausible title-like phrases only if the text contains them or strongly signals them.',
		`Allowed genres (use only these): ${STORY_GENRES.join(', ')}.`,
		`Allowed tones (use only these): ${STORY_TONES.join(', ')}.`,
		'For writingStyleHints, fill all five sub-fields with short descriptive clues based only on this chunk.',
		'For rules, separate world physics (worldRules), narrative demands (storyRules), and per-character constraints (characterRules).',
		'themes are thematic concerns suggested by this chunk.',
	].join(' '),
	num_ctx: 8192,
	outputSchema: z.object({
		genres: z.array(z.string()).default([]),
		premiseClues: z.array(z.string()).default([]),
		rules: z
			.object({
				characterRules: z.array(z.string()).optional().default([]),
				storyRules: z.array(z.string()).optional().default([]),
				worldRules: z.array(z.string()).optional().default([]),
			})
			.optional(),
		themes: z.array(z.string()).optional().default([]),
		titleCandidates: z.array(z.string()).default([]),
		tone: z.array(z.string()).default([]),
		writingStyleHints: z
			.object({
				dialogue: z.string().optional().default(''),
				interiority: z.string().optional().default(''),
				pacing: z.string().optional().default(''),
				prose: z.string().optional().default(''),
				sensory: z.string().optional().default(''),
			})
			.optional(),
	}),
	role: 'story metadata clue extractor',
	temperature: 0.1,
});

export const storyCoreConsolidationAgent = createPromptRunner({
	instructions: [
		'You are given chunk-level story core clues extracted from a long story.',
		'Synthesise a final canonical story metadata object for the whole story.',
		'Write a concise 2-4 sentence premise using the clues. Do not copy verbatim if possible.',
		'Prefer the most complete and repeated title candidate when uncertain.',
		`Allowed genres (use only these): ${STORY_GENRES.join(', ')}.`,
		`Allowed tones (use only these): ${STORY_TONES.join(', ')}.`,
		'For writingStyle, fill all five sub-fields based on the merged evidence.',
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

export const storyCoreParseAgent = storyCoreConsolidationAgent;
