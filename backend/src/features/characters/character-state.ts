import type { Character, MemoryItem } from '@simplechat/types';
import { applyEffect } from '../memories/store/index.js';

function blankBase(char: Character): Character {
	return {
		...char,
		public: {
			appearance: '',
			personality: [],
			speechStyle: '',
			reputation: '',
			voiceNotes: char.public.voiceNotes,
			age: char.public.age,
			gender: char.public.gender,
			species: char.public.species,
			clothing: '',
		},
		private: {
			trueMotives: '',
			fears: [],
			privateKnowledge: [],
			moralLimits: '',
			hiddenEmotionalState: '',
		},
		relationships: [],
		locationRelationships: [],
	};
}

export function applyMemoryChain(
	base: Character,
	chain: MemoryItem[],
): Character {
	const effective: Character = JSON.parse(
		JSON.stringify(base.genesisMemoryId ? blankBase(base) : base),
	);

	for (const memory of chain) {
		for (const effect of memory.deltas.effects) {
			if (effect.entityType === 'character') {
				applyEffect(effective as Record<string, unknown>, effect);
			}
		}
	}

	return effective;
}
