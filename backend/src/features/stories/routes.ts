import { StoryCreateSchema, StoryUpdateSchema } from '@simplechat/types';
import type { FastifyInstance } from 'fastify';
import { seedDefaultFieldDefs } from '../../storage/field-defs';
import { characters_store } from '../characters/store';
import { locations_store } from '../locations/store';
import { stories_store } from './store';

export async function storiesRoutes(app: FastifyInstance): Promise<void> {
	// ─── Stories CRUD ─────────────────────────────────────────────────────────

	app.get('/stories', async () => {
		return stories_store.list();
	});

	app.get<{ Params: { id: string } }>('/stories/:id', async (req, reply) => {
		const story = await stories_store.get(req.params.id);
		if (!story) return reply.status(404).send({ error: 'Story not found' });
		const [characters, locations] = await Promise.all([
			characters_store.list({ storyId: req.params.id }),
			locations_store.list({ storyId: req.params.id }),
		]);
		return { story, characters, locations };
	});

	app.post('/stories', async (req, reply) => {
		const body = StoryCreateSchema.safeParse(req.body);
		if (!body.success)
			return reply.status(400).send({ error: body.error.flatten() });
		const story = await stories_store.add(body.data);
		await seedDefaultFieldDefs(story.id);
		return reply.status(201).send(story);
	});

	app.patch<{ Params: { id: string } }>(
		'/stories/:id',
		async (req, reply) => {
			const body = StoryUpdateSchema.safeParse(req.body);
			if (!body.success)
				return reply.status(400).send({ error: body.error.flatten() });
			const story = await stories_store.update(req.params.id, body.data);
			if (!story)
				return reply.status(404).send({ error: 'Story not found' });
			return story;
		},
	);

	app.delete<{ Params: { id: string } }>(
		'/stories/:id',
		async (req, reply) => {
			const ok = await stories_store.delete(req.params.id);
			if (!ok)
				return reply.status(404).send({ error: 'Story not found' });
			return { ok: true };
		},
	);
}
