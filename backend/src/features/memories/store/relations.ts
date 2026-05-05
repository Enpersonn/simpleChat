import {
	type CharacterMemoryRelation,
	CharacterMemoryRelationSchema,
} from '@simplechat/types';
import { BaseStorageObject } from '../../../storage/base.js';

export const character_memory_relations_store = new BaseStorageObject(
	'character_memory_relations',
	CharacterMemoryRelationSchema,
);

export async function getCharacterRelations(
	charId: string,
): Promise<CharacterMemoryRelation[]> {
	const all = await character_memory_relations_store.list({
		characterId: charId,
	});
	return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getRelationHeads(
	charId: string,
): Promise<CharacterMemoryRelation[]> {
	const all = await getCharacterRelations(charId);
	const refIds = new Set(
		all
			.filter((r) => r.previousRelationId)
			.map((r) => r.previousRelationId!),
	);
	return all.filter((r) => !refIds.has(r.id));
}

export function getRelationChain(
	relationId: string,
	allRelations: CharacterMemoryRelation[],
): CharacterMemoryRelation[] {
	const byId = new Map(allRelations.map((r) => [r.id, r]));
	const chain: CharacterMemoryRelation[] = [];
	const visited = new Set<string>();

	let current = byId.get(relationId);
	while (current) {
		if (visited.has(current.id)) {
			throw new Error(
				`Memory relation chain cycle detected at ${current.id}`,
			);
		}
		visited.add(current.id);
		chain.push(current);
		if (!current.previousRelationId) break;
		current = byId.get(current.previousRelationId);
	}

	// chain is head→root; reverse to root→head
	return chain.reverse();
}
