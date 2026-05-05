import { z } from 'zod';

export const LocationSchema = z.object({
	id: z.string(),
	storyId: z.string(),
	name: z.string().min(1),
	description: z.string().default(''),
	layout: z.string().default(''),
	lighting: z.string().default(''),
	atmosphere: z.string().default(''),
	soundscape: z.string().default(''),
	smells: z.string().default(''),
	notes: z.string().default(''),
	tags: z.array(z.string()).default([]),
	parentLocationId: z.string().nullable().default(null),
	connectedLocationIds: z.array(z.string()).default([]),
	createdAt: z.string(),
	updatedAt: z.string(),
});
export type StoryLocation = z.infer<typeof LocationSchema>;

export const LocationCreateSchema = LocationSchema.omit({
	id: true,
	storyId: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	description: true,
	layout: true,
	lighting: true,
	atmosphere: true,
	soundscape: true,
	smells: true,
	notes: true,
	tags: true,
	parentLocationId: true,
	connectedLocationIds: true,
});
export type LocationCreate = z.infer<typeof LocationCreateSchema>;

export const LocationUpdateSchema = LocationCreateSchema.partial();
export type LocationUpdate = z.infer<typeof LocationUpdateSchema>;
