import type { GenerationContext } from '../../types.js';

export function buildContextSnapshot(ctx: GenerationContext) {
	return {
		accessibleMemories: ctx.accessibleMemories.map((m) => ({
			id: m.id,
			importance: m.importance,
			summary: m.summary.slice(0, 100),
			tags: m.tags,
		})),
		activeSpeakerId: ctx.activeSpeaker,
		characters: ctx.characters.map((base, i) => {
			const effective = ctx.effectiveCharacters[i];

			return {
				baseFears: base.private.fears,
				basePersonality: base.public.personality,
				baseSpeechStyle: base.public.speechStyle ?? '',
				baseTrueMotives: base.private.trueMotives ?? '',
				effectiveFears: effective.private.fears,
				effectivePersonality: effective.public.personality,
				effectiveSpeechStyle: effective.public.speechStyle ?? '',
				effectiveTrueMotives: effective.private.trueMotives ?? '',
				id: base.id,
				isNarrator: base.isNarrator,
				isUserPersona: base.isUserPersona,
				name: base.name,
				role: base.role,
			};
		}),
		currentLocationId: ctx.chatState.currentLocationId,
		feelText: ctx.params.feelText ?? '',
		injectedMemoryIds: ctx.relevantMemories.map((m) => m.id),
		locations: ctx.locations.map((location) => ({
			id: location.id,
			isCurrent: location.id === ctx.chatState.currentLocationId,
			name: location.name,
		})),
		memoryReasons: ctx.memoryReasons,
		model: ctx.resolvedModel,
		moodTags: ctx.params.moodTags ?? [],
		responseLength: ctx.params.responseLength ?? 'medium',
		story: {
			id: ctx.story.id,
			title: ctx.story.title,
		},
	};
}
