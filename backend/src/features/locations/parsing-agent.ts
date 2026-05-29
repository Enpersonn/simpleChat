import { z } from 'zod';
import { createPromptRunner } from '../../LLM/prompt-runners/create-prompt-runner.js';

export const storyLocationsParseAgent = createPromptRunner({
	instructions: [
		'Extract all distinct locations and settings from the story text. Use the story premise as context.',
		"Identify spatial containment: if one location is physically inside another, set parentLocationName to the containing location's name.",
		'Root locations (realms, cities, buildings) have parentLocationName: null.',
		'Sub-locations (rooms, corridors, stages) have the name of their containing location.',
		'Only create a child location if it is clearly distinct from its parent.',
		'connectedLocationNames lists locations reachable via a path, door, or portal (non-hierarchical connections).',
	].join(' '),
	num_ctx: 8192,
	outputSchema: z.object({
		locations: z.array(
			z.object({
				atmosphere: z.string().optional().default(''),
				connectedLocationNames: z
					.array(z.string())
					.optional()
					.default([]),
				description: z.string().optional().default(''),
				layout: z.string().optional().default(''),
				lighting: z.string().optional().default(''),
				name: z.string(),
				notes: z.string().optional().default(''),
				parentLocationName: z
					.string()
					.nullable()
					.optional()
					.default(null),
				smells: z.string().optional().default(''),
				soundscape: z.string().optional().default(''),
				tags: z.array(z.string()).optional().default([]),
			}),
		),
	}),
	role: 'location extractor',
	temperature: 0.1,
});
