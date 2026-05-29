import { randomUUID } from 'node:crypto';
import { SendMessageSchema, type Turn } from '@simplechat/types';
import type { FastifyInstance } from 'fastify';
import { chatGenerationService } from '../services/generation/chat-generation-service.js';
import { appendTurn, chat_store } from '../store.js';

export async function chatGenerationRoutes(
	app: FastifyInstance,
): Promise<void> {
	app.post<{ Params: { storyId: string; chatId: string } }>(
		'/stories/:storyId/chats/:chatId/message',
		async (req, reply) => {
			const body = SendMessageSchema.safeParse(req.body);
			if (!body.success) {
				return reply.status(400).send({ error: body.error.flatten() });
			}

			await chatGenerationService.run({
				chatId: req.params.chatId,
				kind: 'message',
				params: body.data,
				reply,
				req,
				storyId: req.params.storyId,
			});
		},
	);

	app.post<{ Params: { storyId: string; chatId: string } }>(
		'/stories/:storyId/chats/:chatId/regenerate',
		async (req, reply) => {
			const body = SendMessageSchema.partial().safeParse(req.body ?? {});
			if (!body.success) {
				return reply.status(400).send({ error: body.error.flatten() });
			}

			await chatGenerationService.run({
				chatId: req.params.chatId,
				kind: 'regenerate',
				params: body.data,
				reply,
				req,
				storyId: req.params.storyId,
			});
		},
	);

	app.post<{ Params: { storyId: string; chatId: string } }>(
		'/stories/:storyId/chats/:chatId/seed',
		async (req, reply) => {
			const { chatId } = req.params;
			const { text } = req.body as { text?: string };
			if (!text?.trim())
				return reply.status(400).send({ error: 'text is required' });
			const chat = await chat_store.get(chatId);
			if (!chat)
				return reply.status(404).send({ error: 'Chat not found' });
			const turn: Turn = {
				chatId,
				id: randomUUID(),
				meta: { mode: chat.mode },
				pinned: false,
				role: 'assistant',
				speaker: chat.activeSpeakers[0] ?? 'narrator',
				text: text.trim(),
				timestamp: new Date().toISOString(),
			};
			await appendTurn(turn);
			return reply.status(201).send(turn);
		},
	);

	app.post<{ Params: { storyId: string; chatId: string } }>(
		'/stories/:storyId/chats/:chatId/opener',
		async (req, reply) => {
			await chatGenerationService.run({
				chatId: req.params.chatId,
				kind: 'opener',
				params: {},
				reply,
				req,
				storyId: req.params.storyId,
			});
		},
	);
}
