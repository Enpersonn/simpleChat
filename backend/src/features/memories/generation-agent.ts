import { z } from 'zod';
import { createPromptRunner } from '../../LLM/prompt-runners/create-prompt-runner.js';

const relationshipSchema = z.object({
	emotion: z.string().optional().default(''),
	otherCharacterName: z.string(),
	privateAttitude: z.string().optional().default(''),
	publicAttitude: z.string().optional().default(''),
	trustLevel: z.number().optional().default(5),
});

export const storyMemoriesAgent = createPromptRunner({
	instructions:
		'Given a story concept, invent 2–4 backstory/origin events per character — things that happened BEFORE the story begins that shaped who they are. Focus on events with emotional weight: first meetings, formative traumas, key decisions, lost relationships. Order events chronologically, interleave characters naturally. importance 0.0–1.0: 0.9+ for defining moments, 0.6 for significant backstory, 0.4 for minor history. Omit the deltas object entirely if no trait changes resulted from the event. Include relationships in deltas only if the event changed how a character feels about another.',
	outputSchema: z.object({
		memories: z.array(
			z.object({
				characterName: z.string(),
				deltas: z
					.object({
						appearance: z.string().optional(),
						fears: z
							.object({
								add: z.array(z.string()).optional().default([]),
								remove: z
									.array(z.string())
									.optional()
									.default([]),
							})
							.optional(),
						personality: z
							.object({
								add: z.array(z.string()).optional().default([]),
								remove: z
									.array(z.string())
									.optional()
									.default([]),
							})
							.optional(),
						relationships: z
							.array(relationshipSchema)
							.optional()
							.default([]),
						speechStyle: z.string().optional(),
					})
					.optional(),
				importance: z.number(),
				summary: z.string(),
				tags: z.array(z.string()).optional().default([]),
			}),
		),
	}),
	role: 'backstory writer for collaborative fiction',
	temperature: 0.85,
});
