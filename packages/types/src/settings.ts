import { z } from 'zod';
import { ChatModeSchema } from './chat.js';

export const MoodTagSchema = z.enum([
	'tense',
	'warm',
	'eerie',
	'playful',
	'melancholy',
	'action-heavy',
	'mysterious',
	'romantic',
	'dark',
	'hopeful',
]);
export type MoodTag = z.infer<typeof MoodTagSchema>;

export const ResponseLengthSchema = z.enum([
	'short',
	'medium',
	'long',
	'paragraph+',
]);
export type ResponseLength = z.infer<typeof ResponseLengthSchema>;

export const GenerationParamsSchema = z.object({
	temperature: z.number().min(0).max(2).default(0.85),
	top_p: z.number().min(0).max(1).default(0.9),
	top_k: z.number().int().min(1).default(40),
	repeat_penalty: z.number().min(0).default(1.1),
});
export type GenerationParams = z.infer<typeof GenerationParamsSchema>;

export const PromptProfileSchema = z.object({
	id: z.string(),
	name: z.string(),
	mode: ChatModeSchema.default('interactive'),
	moodTags: z.array(MoodTagSchema).default([]),
	responseLength: ResponseLengthSchema.default('medium'),
	feelText: z.string().default(''),
	generationParams: GenerationParamsSchema.default({}),
});
export type PromptProfile = z.infer<typeof PromptProfileSchema>;

export const AppSettingsSchema = z.object({
	ollamaEndpoint: z.string().default('http://localhost:11434'),
	activeModel: z.string().default('igorls/gemma-4-E4B-it-heretic-GGUF'),
	dataDir: z.string().default('./data'),
	theme: z.enum(['dark', 'light']).default('dark'),
	fontFamily: z.string().default('Georgia'),
	fontSize: z.number().default(16),
	streamingTypewriter: z.boolean().default(false),
	globalNote: z.string().default(''),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const DEFAULT_SETTINGS: AppSettings = AppSettingsSchema.parse({});

export const DEFAULT_PROMPT_PROFILES: PromptProfile[] = [
	{
		id: 'cinematic-rp',
		name: 'Cinematic RP',
		mode: 'interactive',
		moodTags: [],
		responseLength: 'medium',
		feelText: 'cinematic, sensory detail, action beats in dialogue',
		generationParams: {
			temperature: 0.85,
			top_p: 0.9,
			top_k: 40,
			repeat_penalty: 1.1,
		},
	},
	{
		id: 'slow-burn-drama',
		name: 'Slow Burn Drama',
		mode: 'interactive',
		moodTags: ['warm', 'melancholy'],
		responseLength: 'medium',
		feelText: 'understated, emotionally layered, subtext-heavy',
		generationParams: {
			temperature: 0.8,
			top_p: 0.9,
			top_k: 35,
			repeat_penalty: 1.1,
		},
	},
	{
		id: 'action-heavy',
		name: 'Action Heavy',
		mode: 'interactive',
		moodTags: ['action-heavy', 'tense'],
		responseLength: 'short',
		feelText: 'sharp short sentences, kinetic energy, fast rhythm',
		generationParams: {
			temperature: 0.9,
			top_p: 0.95,
			top_k: 50,
			repeat_penalty: 1.05,
		},
	},
	{
		id: 'horror-atmospheric',
		name: 'Horror Atmospheric',
		mode: 'interactive',
		moodTags: ['eerie', 'dark'],
		responseLength: 'medium',
		feelText:
			'dread through implication, sensory wrongness, no explicit horror',
		generationParams: {
			temperature: 0.88,
			top_p: 0.92,
			top_k: 40,
			repeat_penalty: 1.15,
		},
	},
	{
		id: 'storyteller-mode',
		name: 'Storyteller',
		mode: 'storyteller',
		moodTags: [],
		responseLength: 'paragraph+',
		feelText:
			'cinematic narration, balance dialogue and action, end with a hook',
		generationParams: {
			temperature: 0.85,
			top_p: 0.9,
			top_k: 40,
			repeat_penalty: 1.1,
		},
	},
];
