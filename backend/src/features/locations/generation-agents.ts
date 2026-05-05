import { z } from 'zod';
import { createPromptRunner } from '../../LLM/prompt-runners/create-prompt-runner';

const locationSchema = z.object({
	name: z.string(),
	description: z.string().optional().default(''),
	layout: z.string().optional().default(''),
	lighting: z.string().optional().default(''),
	atmosphere: z.string().optional().default(''),
	soundscape: z.string().optional().default(''),
	smells: z.string().optional().default(''),
	notes: z.string().optional().default(''),
	tags: z.array(z.string()).optional().default([]),
});

export const locationAgent = createPromptRunner({
	role: 'location designer for collaborative fiction',
	instructions:
		'Given a location description and optional story context, generate a complete location profile.',
	outputSchema: locationSchema,
	temperature: 0.85,
});

export const storyLocationsAgent = createPromptRunner({
	role: 'world-builder for collaborative fiction',
	instructions:
		'Given a story concept and its established style, invent 2–4 compelling, distinct locations that fit this story world.',
	outputSchema: z.object({
		locations: z.array(locationSchema),
	}),
	temperature: 0.85,
});
