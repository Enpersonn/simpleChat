import { z } from 'zod';
import { createPromptRunner } from '../../LLM/prompt-runners/create-prompt-runner.js';

const relationshipSchema = z.object({
	emotion: z.string().optional().default(''),
	otherCharacterName: z.string(),
	privateAttitude: z.string().optional().default(''),
	publicAttitude: z.string().optional().default(''),
	trustLevel: z.number().optional().default(5),
});

export const storyCharactersParseAgent = createPromptRunner({
	instructions:
		'Extract all named characters from the story text. Use the story premise as context. Also extract the initial relationships between characters as they appear at the start of the story. trustLevel is an integer 0–10 (0=no trust, 5=neutral, 10=complete trust). Omit the relationships array entirely if the character has no notable relationships.',
	num_ctx: 8192,
	outputSchema: z.object({
		characters: z.array(
			z.object({
				age: z.string().optional().default(''),
				appearance: z.string().optional().default(''),
				clothing: z.string().optional().default(''),
				fears: z.array(z.string()).optional().default([]),
				gender: z.string().optional().default(''),
				isUserPersona: z.boolean().optional().default(false),
				name: z.string(),
				personality: z.array(z.string()).optional().default([]),
				relationships: z
					.array(relationshipSchema)
					.optional()
					.default([]),
				role: z.string().optional().default(''),
				species: z.string().optional().default('human'),
				speechStyle: z.string().optional().default(''),
				trueMotives: z.string().optional().default(''),
			}),
		),
	}),
	role: 'character extractor',
	temperature: 0.1,
});

export const characterDeepDiveAgent = createPromptRunner({
	instructions: [
		'You are given a complete story text and a single character name. Extract EVERYTHING the text reveals about that character.',
		"Do not write 'Unknown'. If it is in the text, extract it.",
		'For identities: list each distinct form or persona the character has (e.g. human disguise vs true form).',
		'selfAware is true if the character knows about that identity.',
		'linkedCharacterNames lists other character names who are the same entity at a different point in time or under a different name.',
		'Only include linkedCharacterNames if the text explicitly confirms the link.',
		'Personality, fears, and privateKnowledge reflect the character AT THE START of the story (before any events change them).',
	].join(' '),
	num_ctx: 8192,
	outputSchema: z.object({
		age: z.string().optional().default(''),
		appearance: z.string().optional().default(''),
		clothing: z.string().optional().default(''),
		fears: z.array(z.string()).optional().default([]),
		gender: z.string().optional().default(''),
		hiddenEmotionalState: z.string().optional().default(''),
		identities: z
			.array(
				z.object({
					abilities: z.array(z.string()).optional().default([]),
					appearance: z.string().optional().default(''),
					conditions: z.string().optional().default(''),
					knownBy: z.array(z.string()).optional().default([]),
					name: z.string(),
					notes: z.string().optional().default(''),
					selfAware: z.boolean().optional().default(false),
				}),
			)
			.optional()
			.default([]),
		linkedCharacterNames: z.array(z.string()).optional().default([]),
		moralLimits: z.string().optional().default(''),
		name: z.string(),
		personality: z.array(z.string()).optional().default([]),
		privateKnowledge: z.array(z.string()).optional().default([]),
		role: z.string().optional().default(''),
		species: z.string().optional().default('human'),
		speechStyle: z.string().optional().default(''),
		trueMotives: z.string().optional().default(''),
	}),
	role: 'character analyst',
	temperature: 0.2,
});
