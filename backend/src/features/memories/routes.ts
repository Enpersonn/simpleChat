import {
	type CharacterMemoryRelation,
	CharacterMemoryUpdateSchema,
	CharacterMemoryWithRelationCreateSchema,
} from '@simplechat/types';
import type { FastifyInstance } from 'fastify';
import { now } from '../../storage/helpers.js';
import { memories_store } from './store/index.js';
import {
	character_memory_relations_store,
	getRelationHeads,
} from './store/relations.js';

export async function characterMemoriesRoutes(
	app: FastifyInstance,
): Promise<void> {
	app.get<{ Params: { id: string; cid: string } }>(
		'/stories/:id/characters/:cid/memories',
		async (req) => {
			const relations = await character_memory_relations_store.list({
				characterId: req.params.cid,
			});
			const items = await Promise.all(
				relations.map((r) => memories_store.get(r.memoryId)),
			);
			return items.filter((m) => m !== null);
		},
	);

	app.get<{
		Params: { id: string; cid: string };
		Querystring: { from?: string };
	}>('/stories/:id/characters/:cid/memories/chain', async (req) => {
		const { cid } = req.params;
		const { from } = req.query;

		const allRelations = await character_memory_relations_store.list({
			characterId: cid,
		});

		let headRelation: CharacterMemoryRelation | undefined;
		if (from) {
			headRelation = allRelations.find((r) => r.id === from);
		}
		if (!headRelation) {
			const heads = await getRelationHeads(cid);
			headRelation = heads.sort((a, b) =>
				b.createdAt.localeCompare(a.createdAt),
			)[0];
		}
		if (!headRelation) return [];

		// Build chain root→head
		const byId = new Map(allRelations.map((r) => [r.id, r]));
		const chain: CharacterMemoryRelation[] = [];
		const visited = new Set<string>();
		let cur: CharacterMemoryRelation | undefined = headRelation;
		while (cur) {
			if (visited.has(cur.id)) break;
			visited.add(cur.id);
			chain.push(cur);
			cur = cur.previousRelationId
				? byId.get(cur.previousRelationId)
				: undefined;
		}
		chain.reverse(); // root first

		const pairs = await Promise.all(
			chain.map(async (relation) => {
				const memory = await memories_store.get(relation.memoryId);
				return memory ? { relation, memory } : null;
			}),
		);
		return pairs.filter((p) => p !== null);
	});

	app.post<{ Params: { id: string; cid: string } }>(
		'/stories/:id/characters/:cid/memories',
		async (req, reply) => {
			const body = CharacterMemoryWithRelationCreateSchema.safeParse(
				req.body,
			);
			if (!body.success)
				return reply.status(400).send({ error: body.error.flatten() });

			const { previousRelationId, branchLabel, ...memContent } =
				body.data;

			if (!previousRelationId) {
				const heads = await getRelationHeads(req.params.cid);
				if (heads.length > 1) {
					return reply.status(409).send({
						error: 'Multiple memory branches exist. Specify previousRelationId to indicate which branch to extend.',
						heads: heads.map((h) => ({
							id: h.id,
							branchLabel: h.branchLabel,
							createdAt: h.createdAt,
						})),
					});
				}
				// Auto-link to the single existing head
				const autoHead = heads[0];
				const memory = await memories_store.add({
					...memContent,
					storyId: req.params.id,
				});
				const relation = await character_memory_relations_store.add({
					storyId: req.params.id,
					characterId: req.params.cid,
					memoryId: memory.id,
					previousRelationId: autoHead?.id,
					branchLabel,
					createdAt: now(),
				});
				return reply.status(201).send({ relation, memory });
			}

			const memory = await memories_store.add({
				...memContent,
				storyId: req.params.id,
			});
			const relation = await character_memory_relations_store.add({
				storyId: req.params.id,
				characterId: req.params.cid,
				memoryId: memory.id,
				previousRelationId,
				branchLabel,
				createdAt: now(),
			});
			return reply.status(201).send({ relation, memory });
		},
	);

	app.patch<{ Params: { id: string; cid: string; mid: string } }>(
		'/stories/:id/characters/:cid/memories/:mid',
		async (req, reply) => {
			const body = CharacterMemoryUpdateSchema.safeParse(req.body);
			if (!body.success)
				return reply.status(400).send({ error: body.error.flatten() });

			const { branchLabel, previousRelationId, ...memFields } = body.data;

			let memory = await memories_store.get(req.params.mid);
			if (!memory)
				return reply.status(404).send({ error: 'Memory not found' });

			if (Object.keys(memFields).length > 0) {
				memory =
					(await memories_store.update(req.params.mid, memFields)) ??
					memory;
			}

			if (branchLabel !== undefined || previousRelationId !== undefined) {
				const relations = await character_memory_relations_store.list({
					characterId: req.params.cid,
					memoryId: req.params.mid,
				});
				const rel = relations[0];
				if (rel) {
					const updates: Record<string, unknown> = {};
					if (branchLabel !== undefined)
						updates.branchLabel = branchLabel;
					if (previousRelationId !== undefined)
						updates.previousRelationId = previousRelationId;
					await character_memory_relations_store.update(
						rel.id,
						updates,
					);
				}
			}

			return memory;
		},
	);

	app.delete<{ Params: { id: string; cid: string; mid: string } }>(
		'/stories/:id/characters/:cid/memories/:mid',
		async (req, reply) => {
			const relations = await character_memory_relations_store.list({
				characterId: req.params.cid,
				memoryId: req.params.mid,
			});
			const rel = relations[0];
			if (!rel)
				return reply.status(404).send({ error: 'Memory not found' });

			await character_memory_relations_store.delete(rel.id);

			// Delete the memory content only if no other relations reference it
			const otherRefs = await character_memory_relations_store.list({
				memoryId: req.params.mid,
			});
			if (otherRefs.length === 0) {
				await memories_store.delete(req.params.mid);
			}

			return { ok: true };
		},
	);
}
