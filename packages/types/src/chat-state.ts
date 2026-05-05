import { z } from 'zod';

const LocationOverrideSchema = z.object({
	lighting: z.string().optional(),
	atmosphere: z.string().optional(),
	soundscape: z.string().optional(),
	smells: z.string().optional(),
	description: z.string().optional(),
});
export type LocationOverride = z.infer<typeof LocationOverrideSchema>;

export const ChatEntityStateSchema = z.object({
	chatId: z.string(),
	storyId: z.string(),
	currentLocationId: z.string().nullable().default(null),
	locationOverrides: z.record(LocationOverrideSchema).default({}),
	updatedAt: z.string(),
});
export type ChatEntityState = z.infer<typeof ChatEntityStateSchema>;
