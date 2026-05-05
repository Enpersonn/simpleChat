import type { FastifyInstance } from 'fastify';
import { deleteAfterTurn, deleteSingleTurn, turn_store } from '../store';

export async function chatTurnRoutes(app: FastifyInstance): Promise<void> {
	app.patch<{ Params: { storyId: string; chatId: string; turnId: string } }>(
		'/stories/:storyId/chats/:chatId/turns/:turnId',
		async (req, reply) => {
			const { text } = req.body as { text?: string };
			if (!text)
				return reply.status(400).send({ error: 'text is required' });
			const turn = await turn_store.update(req.params.turnId, { text });
			if (!turn)
				return reply.status(404).send({ error: 'Turn not found' });
			return turn;
		},
	);

	app.delete<{ Params: { storyId: string; chatId: string; turnId: string } }>(
		'/stories/:storyId/chats/:chatId/turns/:turnId',
		async (req, reply) => {
			const ok = await deleteSingleTurn(
				req.params.storyId,
				req.params.chatId,
				req.params.turnId,
			);
			if (!ok) return reply.status(404).send({ error: 'Turn not found' });
			return { ok: true };
		},
	);

	app.delete<{ Params: { storyId: string; chatId: string; turnId: string } }>(
		'/stories/:storyId/chats/:chatId/turns/:turnId/after',
		async (req, reply) => {
			const ok = await deleteAfterTurn(
				req.params.storyId,
				req.params.chatId,
				req.params.turnId,
			);
			if (!ok) return reply.status(404).send({ error: 'Turn not found' });
			return { ok: true };
		},
	);
}
