import { z } from 'zod';
import { createPromptRunner } from '../../LLM/prompt-runners/create-prompt-runner.js';

export const storyMemoriesParseAgent = createPromptRunner({
	instructions: [
		'Read the story text and extract key story events/turning points for each named character, in chronological order (earliest event first, storyOrder starting at 1). Include 3-8 events per character; only include events with importance >= 0.4. Interleave characters naturally in timeline order.',
		'importance is a float 0.0–1.0: use 0.9+ for major turning points, 0.7 for character-defining events, 0.4-0.69 for plot events.',
		'sceneId is the name of the scene or act this event belongs to (use the scene delimiter text if present).',
		"For effects: list only fields that CHANGED as a result of this event, using the exact dot-path (e.g. public.personality, private.hiddenEmotionalState, private.fears, relationships). Use op 'add' or 'remove' for arrays, 'set' for strings. Omit effects entirely if nothing changed.",
		"entityType is always 'character'. targetId is only needed for relationship path effects.",
	].join(' '),
	num_ctx: 8192,
	outputSchema: z.object({
		memories: z.array(
			z.object({
				characterName: z.string(),
				effects: z
					.array(
						z.object({
							entityType: z
								.string()
								.optional()
								.default('character'),
							op: z.string(),
							path: z.string(),
							targetId: z.string().optional(),
							value: z.unknown().optional(),
							weight: z.number().optional().default(1),
						}),
					)
					.optional()
					.default([]),
				importance: z.number(),
				sceneId: z.string().nullable().optional().default(null),
				storyOrder: z.number(),
				summary: z.string(),
				tags: z.array(z.string()).optional().default([]),
			}),
		),
	}),
	role: 'story event extractor',
	temperature: 0.1,
});
