import { ChatEntityStateSchema } from '@simplechat/types';
import type { FastifyInstance } from 'fastify';
import { chat_state_store, chat_store } from '../store';

export async function ChatStateRoutes(app: FastifyInstance): Promise<void> {
	app.get<{ Params: { storyId: string; chatId: string } }>(
		'/stories/:storyId/chats/:chatId/state',
		async (req, reply) => {
			const chat = await chat_store.get(req.params.chatId);
			if (!chat)
				return reply.status(404).send({ error: 'Chat not found' });
			return chat_state_store.get(req.params.chatId);
		},
	);

	app.patch<{ Params: { storyId: string; chatId: string } }>(
		'/stories/:storyId/chats/:chatId/state',
		async (req, reply) => {
			const chat = await chat_store.get(req.params.chatId);
			if (!chat)
				return reply.status(404).send({ error: 'Chat not found' });
			const body = ChatEntityStateSchema.partial().safeParse(req.body);
			if (!body.success)
				return reply.status(400).send({ error: body.error.flatten() });
			const updated = chat_state_store.update(
				req.params.chatId,
				body.data,
			);
			return updated;
		},
	);
}
