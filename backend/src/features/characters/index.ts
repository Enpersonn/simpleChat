import type { Character, MemoryDeltaEffect } from '@simplechat/types';
import { now } from '../../storage/helpers';
import {
	character_memory_relations_store,
	memories_store,
} from '../memories/store';
import { characters_store } from './store';

export async function createGenesisMemory(char: Character): Promise<Character> {
	if (char.genesisMemoryId) return char;

	const effects: MemoryDeltaEffect[] = [];

	for (const trait of char.public.personality) {
		effects.push({
			path: 'public.personality',
			op: 'add',
			value: trait,
			weight: 1,
			entityType: 'character',
		});
	}
	for (const fear of char.private.fears) {
		effects.push({
			path: 'private.fears',
			op: 'add',
			value: fear,
			weight: 1,
			entityType: 'character',
		});
	}
	for (const item of char.private.privateKnowledge) {
		effects.push({
			path: 'private.privateKnowledge',
			op: 'add',
			value: item,
			weight: 1,
			entityType: 'character',
		});
	}
	if (char.public.appearance)
		effects.push({
			path: 'public.appearance',
			op: 'set',
			value: char.public.appearance,
			weight: 1,
			entityType: 'character',
		});
	if (char.public.speechStyle)
		effects.push({
			path: 'public.speechStyle',
			op: 'set',
			value: char.public.speechStyle,
			weight: 1,
			entityType: 'character',
		});
	if (char.public.reputation)
		effects.push({
			path: 'public.reputation',
			op: 'set',
			value: char.public.reputation,
			weight: 1,
			entityType: 'character',
		});
	if (char.public.clothing)
		effects.push({
			path: 'public.clothing',
			op: 'set',
			value: char.public.clothing,
			weight: 1,
			entityType: 'character',
		});
	if (char.private.trueMotives)
		effects.push({
			path: 'private.trueMotives',
			op: 'set',
			value: char.private.trueMotives,
			weight: 1,
			entityType: 'character',
		});
	if (char.private.moralLimits)
		effects.push({
			path: 'private.moralLimits',
			op: 'set',
			value: char.private.moralLimits,
			weight: 1,
			entityType: 'character',
		});
	if (char.private.hiddenEmotionalState)
		effects.push({
			path: 'private.hiddenEmotionalState',
			op: 'set',
			value: char.private.hiddenEmotionalState,
			weight: 1,
			entityType: 'character',
		});
	if (char.relationships.length > 0)
		effects.push({
			path: 'relationships',
			op: 'set',
			value: char.relationships as Record<string, unknown>[],
			weight: 1,
			entityType: 'character',
		});
	if (char.locationRelationships.length > 0)
		effects.push({
			path: 'locationRelationships',
			op: 'set',
			value: char.locationRelationships as Record<string, unknown>[],
			weight: 1,
			entityType: 'character',
		});

	const summaryParts: string[] = [];
	if (char.role) summaryParts.push(`${char.name} is a ${char.role}.`);
	if (char.public.personality.length)
		summaryParts.push(
			`Personality: ${char.public.personality.join(', ')}.`,
		);
	if (char.public.appearance) summaryParts.push(char.public.appearance);
	if (char.private.trueMotives)
		summaryParts.push(`True motives: ${char.private.trueMotives}`);
	if (!summaryParts.length)
		summaryParts.push(`${char.name} — starting state.`);

	const t = now();
	const genesis = await memories_store.add({
		summary: summaryParts.join(' '),
		storyId: char.storyId,
		tags: [...char.public.personality, ...char.private.fears].slice(0, 10),
		importance: 1.0,
		deltas: { effects },
		createdAt: t,
		updatedAt: t,
	});

	await character_memory_relations_store.add({
		storyId: char.storyId,
		characterId: char.id,
		memoryId: genesis.id,
		createdAt: t,
	});

	const updated = await characters_store.update(char.id, {
		genesisMemoryId: genesis.id,
	});
	return updated ?? char;
}
