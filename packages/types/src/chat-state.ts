import { z } from 'zod';

const LocationOverrideSchema = z.object({
	atmosphere: z.string().optional(),
	description: z.string().optional(),
	lighting: z.string().optional(),
	smells: z.string().optional(),
	soundscape: z.string().optional(),
});
export type LocationOverride = z.infer<typeof LocationOverrideSchema>;

export const VolatileCharacterStateSchema = z.object({
	emotionalColor: z.string().default(''),
	focus: z.string().default(''),
	stress: z.number().min(0).max(10).default(5),
});
export type VolatileCharacterState = z.infer<typeof VolatileCharacterStateSchema>;

export const ChatEntityStateSchema = z.object({
	activeHooks: z.array(z.string()).default([]),
	chatId: z.string(),
	currentLocationId: z.string().nullable().default(null),
	locationOverrides: z.record(z.string(), LocationOverrideSchema).default({}),
	narrativePressure: z.number().min(0).max(100).default(0),
	storyId: z.string(),
	updatedAt: z.string(),
	volatileState: z.record(z.string(), VolatileCharacterStateSchema).default({}),
});
export type ChatEntityState = z.infer<typeof ChatEntityStateSchema>;
