import { z } from 'zod';
import { createPromptRunner } from '../prompt-runners/create-prompt-runner.js';

export const censusAgent = createPromptRunner({
	instructions: [
		'List every named entity in the story text. Do not describe them — enumerate names only.',
		'characterNames: every named person, creature, or being.',
		'locationNames: every named place, realm, room, or setting.',
		'sceneNames: every scene or act title found in the text (look for delimiter lines like —Scene Name—).',
		'If no scene delimiters exist, infer scene names from major location or event transitions.',
	].join(' '),
	num_ctx: 8192,
	outputSchema: z.object({
		characterNames: z.array(z.string()),
		locationNames: z.array(z.string()),
		sceneNames: z.array(z.string()),
	}),
	role: 'story entity census',
	temperature: 0.1,
});
