import {
	ChatCreateSchema,
	ChatEntityStateSchema,
	ChatModeSchema,
} from '@simplechat/types';
import type { FastifyInstance } from 'fastify';
import { chat_state_store, chat_store, turn_store } from '../store';

export async function chatCRUDRoutes(app: FastifyInstance): Promise<void> {
	app.get<{ Params: { storyId: string } }>(
		'/stories/:storyId/chats',
		async (req) => {
			return chat_store.list({ storyId: req.params.storyId });
		},
	);

	app.post<{ Params: { storyId: string } }>(
		'/stories/:storyId/chats',
		async (req, reply) => {
			const body = ChatCreateSchema.safeParse({
				...(req.body as object),
				storyId: req.params.storyId,
			});
			if (!body.success)
				return reply.status(400).send({ error: body.error.flatten() });
			const chat = await chat_store.add(body.data);
			await chat_state_store.update(
				chat.id,
				ChatEntityStateSchema.parse({
					chatId: chat.id,
					storyId: req.params.storyId,
					currentLocationId: body.data.startingLocationId ?? null,
					locationOverrides: {},
					updatedAt: new Date().toISOString(),
				}),
			);
			return reply.status(201).send(chat);
		},
	);

	app.get<{ Params: { storyId: string; chatId: string } }>(
		'/stories/:storyId/chats/:chatId',
		async (req, reply) => {
			const chat = await chat_store.get(req.params.chatId);
			if (!chat)
				return reply.status(404).send({ error: 'Chat not found' });
			return chat;
		},
	);

	app.get<{ Params: { storyId: string; chatId: string } }>(
		'/stories/:storyId/chats/:chatId/history',
		async (req, reply) => {
			const chat = await chat_store.get(req.params.chatId);
			if (!chat)
				return reply.status(404).send({ error: 'Chat not found' });
			const turns = await turn_store.list({ chatId: req.params.chatId });
			return turns;
		},
	);

	app.patch<{ Params: { storyId: string; chatId: string } }>(
		'/stories/:storyId/chats/:chatId',
		async (req, reply) => {
			const chat = await chat_store.get(req.params.chatId);
			if (!chat)
				return reply.status(404).send({ error: 'Chat not found' });
			const body = req.body as { title?: string; mode?: string };
			const parsedMode =
				body.mode !== undefined
					? ChatModeSchema.safeParse(body.mode)
					: null;
			const updated = await chat_store.update(req.params.chatId, {
				...(body.title !== undefined ? { title: body.title } : {}),
				...(parsedMode?.success ? { mode: parsedMode.data } : {}),
			});
			return updated;
		},
	);

	app.delete<{ Params: { storyId: string; chatId: string } }>(
		'/stories/:storyId/chats/:chatId',
		async (req, reply) => {
			const { chatId } = req.params;
			const chat = await chat_store.get(chatId);
			if (!chat)
				return reply.status(404).send({ error: 'Chat not found' });
			await chat_store.delete(chatId);
			const allTurns = await turn_store.list();
			await turn_store.replaceAll(
				allTurns.filter((t) => t.chatId !== chatId),
			);
			await chat_state_store.delete(chatId);
			return { ok: true };
		},
	);
}
