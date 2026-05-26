import { z } from 'zod';

export const ChatModeSchema = z.enum([
	'interactive',
	'storyteller',
	'planning',
]);
export type ChatMode = z.infer<typeof ChatModeSchema>;

export const DmProposalSchema = z.object({
	id: z.string(),
	type: z.enum(['character', 'location', 'memory']),
	rationale: z.string(),
	entityData: z.record(z.string(), z.unknown()),
});
export type DmProposal = z.infer<typeof DmProposalSchema>;

export const TurnSchema = z.object({
	id: z.string(),
	chatId: z.string(),
	speaker: z.string(), // 'user' | 'narrator' | characterId
	role: z.enum(['user', 'assistant']),
	text: z.string(),
	timestamp: z.string(),
	pinned: z.boolean().default(false),
	annotation: z.string().optional(),
	meta: z
		.object({
			mode: ChatModeSchema,
			promptTokens: z.number().optional(),
			completionTokens: z.number().optional(),
			modelParams: z.record(z.string(), z.unknown()).optional(),
		})
		.optional(),
});
export type Turn = z.infer<typeof TurnSchema>;

export const ChatSchema = z.object({
	id: z.string(),
	storyId: z.string(),
	title: z.string().default(''),
	mode: ChatModeSchema.default('interactive'),
	activeSpeakers: z.array(z.string()).default([]),
	createdAt: z.string(),
	updatedAt: z.string(),
	parentChatId: z.string().optional(),
	branchedFromTurnId: z.string().optional(),
	memoryTimelineCutoff: z.string().optional(),
	memoryAnchors: z.record(z.string(), z.string()).optional(),
});
export type Chat = z.infer<typeof ChatSchema>;

export const ChatCreateSchema = z.object({
	storyId: z.string(),
	title: z.string().optional(),
	mode: ChatModeSchema.optional(),
	activeSpeakers: z.array(z.string()).optional(),
	memoryTimelineCutoff: z.string().optional(),
	startingLocationId: z.string().optional(),
	memoryAnchors: z.record(z.string(), z.string()).optional(),
});
export type ChatCreate = z.infer<typeof ChatCreateSchema>;

export const SendMessageSchema = z.object({
	text: z.string().min(1),
	speaker: z.string().default('user'),
	moodTags: z.array(z.string()).default([]),
	responseLength: z
		.enum(['short', 'medium', 'long', 'paragraph+'])
		.default('medium'),
	feelText: z.string().default(''),
	temperature: z.number().min(0).max(2).optional(),
	top_p: z.number().min(0).max(1).optional(),
	top_k: z.number().int().min(1).optional(),
	repeat_penalty: z.number().min(0).optional(),
	model: z.string().optional(),
});
export type SendMessage = z.infer<typeof SendMessageSchema>;
