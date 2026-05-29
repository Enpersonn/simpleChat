import type { Character, MemoryDeltaEffect } from '@simplechat/types';
import { now } from '../../storage/helpers.js';
import {
	character_memory_relations_store,
	memories_store,
} from '../memories/store/index.js';
import { characters_store } from './store.js';

export async function createGenesisMemory(char: Character): Promise<Character> {
	if (char.genesisMemoryId) return char;

	const effects: MemoryDeltaEffect[] = [];

	for (const trait of char.public.personality) {
		effects.push({
			entityType: 'character',
			op: 'add',
			path: 'public.personality',
			value: trait,
			weight: 1,
		});
	}
	for (const fear of char.private.fears) {
		effects.push({
			entityType: 'character',
			op: 'add',
			path: 'private.fears',
			value: fear,
			weight: 1,
		});
	}
	for (const item of char.private.privateKnowledge) {
		effects.push({
			entityType: 'character',
			op: 'add',
			path: 'private.privateKnowledge',
			value: item,
			weight: 1,
		});
	}
	if (char.public.appearance)
		effects.push({
			entityType: 'character',
			op: 'set',
			path: 'public.appearance',
			value: char.public.appearance,
			weight: 1,
		});
	if (char.public.speechStyle)
		effects.push({
			entityType: 'character',
			op: 'set',
			path: 'public.speechStyle',
			value: char.public.speechStyle,
			weight: 1,
		});
	if (char.public.reputation)
		effects.push({
			entityType: 'character',
			op: 'set',
			path: 'public.reputation',
			value: char.public.reputation,
			weight: 1,
		});
	if (char.public.clothing)
		effects.push({
			entityType: 'character',
			op: 'set',
			path: 'public.clothing',
			value: char.public.clothing,
			weight: 1,
		});
	if (char.private.trueMotives)
		effects.push({
			entityType: 'character',
			op: 'set',
			path: 'private.trueMotives',
			value: char.private.trueMotives,
			weight: 1,
		});
	if (char.private.moralLimits)
		effects.push({
			entityType: 'character',
			op: 'set',
			path: 'private.moralLimits',
			value: char.private.moralLimits,
			weight: 1,
		});
	if (char.private.hiddenEmotionalState)
		effects.push({
			entityType: 'character',
			op: 'set',
			path: 'private.hiddenEmotionalState',
			value: char.private.hiddenEmotionalState,
			weight: 1,
		});
	if (char.relationships.length > 0)
		effects.push({
			entityType: 'character',
			op: 'set',
			path: 'relationships',
			value: char.relationships as Record<string, unknown>[],
			weight: 1,
		});
	if (char.locationRelationships.length > 0)
		effects.push({
			entityType: 'character',
			op: 'set',
			path: 'locationRelationships',
			value: char.locationRelationships as Record<string, unknown>[],
			weight: 1,
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
		createdAt: t,
		deltas: { effects },
		importance: 1.0,
		storyId: char.storyId,
		summary: summaryParts.join(' '),
		tags: [...char.public.personality, ...char.private.fears].slice(0, 10),
		updatedAt: t,
	});

	await character_memory_relations_store.add({
		characterId: char.id,
		createdAt: t,
		memoryId: genesis.id,
		storyId: char.storyId,
	});

	const updated = await characters_store.update(char.id, {
		genesisMemoryId: genesis.id,
	});
	return updated ?? char;
}
