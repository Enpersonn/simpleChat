import { randomUUID } from 'node:crypto';
import { MemoryItemCreateSchema } from '@simplechat/types';
import type { FastifyInstance } from 'fastify';
import { now } from '../../../storage/helpers.js';
import { memories_store } from '../../memories/store/index.js';

export async function chatMemoryRoutes(app: FastifyInstance): Promise<void> {
	app.get<{ Params: { storyId: string; chatId: string } }>(
		'/stories/:storyId/chats/:chatId/memory',
		async (req) => {
			return memories_store.list({ storyId: req.params.storyId });
		},
	);

	app.post<{ Params: { storyId: string; chatId: string } }>(
		'/stories/:storyId/chats/:chatId/memory',
		async (req, reply) => {
			const body = MemoryItemCreateSchema.safeParse(req.body);
			if (!body.success)
				return reply.status(400).send({ error: body.error.flatten() });
			const item = await memories_store.add({
				...body.data,
				createdAt: now(),
				id: randomUUID(),
				storyId: req.params.storyId,
				updatedAt: now(),
			});
			return reply.status(201).send(item);
		},
	);
}
