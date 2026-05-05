import type { MemoryDeltaEffect } from '@simplechat/types';

export function convertDeltasToEffects(
	deltas: Record<string, unknown>,
): MemoryDeltaEffect[] {
	const effects: MemoryDeltaEffect[] = [];
	for (const [field, path] of [
		['personality', 'public.personality'],
		['fears', 'private.fears'],
		['privateKnowledge', 'private.privateKnowledge'],
	] as const) {
		const group = deltas[field] as
			| { add?: string[]; remove?: string[] }
			| undefined;
		for (const v of group?.add ?? [])
			effects.push({
				entityType: 'character',
				op: 'add',
				path,
				value: v,
				weight: 1,
			});
		for (const v of group?.remove ?? [])
			effects.push({
				entityType: 'character',
				op: 'remove',
				path,
				value: v,
				weight: 1,
			});
	}
	for (const [field, path] of [
		['speechStyle', 'public.speechStyle'],
		['appearance', 'public.appearance'],
		['clothing', 'public.clothing'],
		['reputation', 'public.reputation'],
		['trueMotives', 'private.trueMotives'],
		['hiddenEmotionalState', 'private.hiddenEmotionalState'],
		['moralLimits', 'private.moralLimits'],
	] as const) {
		if (typeof deltas[field] === 'string')
			effects.push({
				entityType: 'character',
				op: 'set',
				path,
				value: deltas[field] as string,
				weight: 1,
			});
	}
	return effects;
}
