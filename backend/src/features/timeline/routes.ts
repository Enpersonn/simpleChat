import { CanonEntryCreateSchema } from '@simplechat/types';
import type { FastifyInstance } from 'fastify';
import { stories_store } from '../stories/store';
import {
	addCanonEntry,
	getCanonTimeline,
	removeCanonEntry,
	reorderCanonTimeline,
} from './store';

export async function canonTimelineRoutes(app: FastifyInstance): Promise<void> {
	app.get<{ Params: { id: string } }>(
		'/stories/:id/canon-timeline',
		async (req, reply) => {
			const story = await stories_store.get(req.params.id);
			if (!story)
				return reply.status(404).send({ error: 'Story not found' });
			return getCanonTimeline(req.params.id);
		},
	);

	app.post<{ Params: { id: string } }>(
		'/stories/:id/canon-timeline/entries',
		async (req, reply) => {
			const story = await stories_store.get(req.params.id);
			if (!story)
				return reply.status(404).send({ error: 'Story not found' });
			const body = CanonEntryCreateSchema.safeParse(req.body);
			if (!body.success)
				return reply.status(400).send({ error: body.error.flatten() });
			const timeline = await addCanonEntry(req.params.id, body.data);
			return reply.status(201).send(timeline);
		},
	);

	app.put<{ Params: { id: string } }>(
		'/stories/:id/canon-timeline/reorder',
		async (req, reply) => {
			const story = await stories_store.get(req.params.id);
			if (!story)
				return reply.status(404).send({ error: 'Story not found' });
			const { entryIds } = req.body as { entryIds?: string[] };
			if (!Array.isArray(entryIds))
				return reply
					.status(400)
					.send({ error: 'entryIds array is required' });
			return reorderCanonTimeline(req.params.id, entryIds);
		},
	);

	app.delete<{ Params: { id: string; entryId: string } }>(
		'/stories/:id/canon-timeline/entries/:entryId',
		async (req, reply) => {
			const story = await stories_store.get(req.params.id);
			if (!story)
				return reply.status(404).send({ error: 'Story not found' });
			return removeCanonEntry(req.params.id, req.params.entryId);
		},
	);
}
