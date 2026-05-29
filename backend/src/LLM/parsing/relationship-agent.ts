import { z } from 'zod';
import { createPromptRunner } from '../prompt-runners/create-prompt-runner.js';

export const relationshipAgent = createPromptRunner({
	role: 'character relationship extractor',
	instructions: [
		'For each character pair that shares a scene, extract their relationship as it stands AT THE START of the story.',
		'Only include pairs where there is meaningful relationship information in the text.',
		'trustLevel is an integer 0–10 (0=no trust, 5=neutral, 10=complete trust).',
		'fromCharacter and toCharacter must match character names exactly.',
	].join(' '),
	outputSchema: z.object({
		relationships: z.array(
			z.object({
				fromCharacter: z.string(),
				toCharacter: z.string(),
				emotion: z.string(),
				publicAttitude: z.string(),
				privateAttitude: z.string(),
				trustLevel: z.number(),
			}),
		),
	}),
	temperature: 0.1,
	num_ctx: 8192,
});

export const relationshipEvidenceAgent = createPromptRunner({
	role: 'character relationship evidence extractor',
	instructions: [
		'Read this chunk of story text and extract only chunk-local relationship evidence for named character pairs.',
		'Only include relationships that are explicitly supported by this chunk.',
		'fromCharacter and toCharacter must match the provided character names exactly.',
		'Use trustLevel 0-10 and keep it conservative when evidence is weak.',
		'Do not invent pairs that are not mentioned together or clearly implied in this chunk.',
	].join(' '),
	outputSchema: z.object({
		relationships: z.array(
			z.object({
				fromCharacter: z.string(),
				toCharacter: z.string(),
				emotion: z.string().default(''),
				publicAttitude: z.string().default(''),
				privateAttitude: z.string().default(''),
				trustLevel: z.number().default(5),
			}),
		),
	}),
	temperature: 0.1,
	num_ctx: 8192,
});
