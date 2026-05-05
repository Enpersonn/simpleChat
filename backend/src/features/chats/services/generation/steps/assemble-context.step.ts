import type { MemoryItem } from '@simplechat/types';
import { getSettings } from '../../../../../config';
import { assembleContext } from '../../../../../LLM/context';
import { activeModel } from '../../../../../LLM/ollama';
import type { GenerationContext } from '../../../types';

export const assembleContextStep = async (ctx: GenerationContext) => {
	const speakerChar = ctx.characters.find((c) => c.id === ctx.activeSpeaker);
	const effectiveModel =
		speakerChar?.modelOverride || ctx.params?.model || undefined;
	const resolvedModel = effectiveModel ?? (await activeModel());

	const currentLocation = ctx.chatState.currentLocationId
		? ctx.locations.find((l) => l.id === ctx.chatState.currentLocationId)
		: undefined;
	const locationOverrides = ctx.chatState.currentLocationId
		? ctx.chatState.locationOverrides[ctx.chatState.currentLocationId]
		: undefined;

	const settings = await getSettings();

	const otherCharMemoriesRegen = new Map<string, MemoryItem[]>();
	for (let i = 0; i < ctx.characters.length; i++) {
		const c = ctx.characters[i];
		if (c.id !== ctx.activeSpeaker && !c.isUserPersona) {
			otherCharMemoriesRegen.set(c.id, ctx.characterChains[i]);
		}
	}

	const messages = assembleContext({
		story: ctx.story,
		characters: ctx.effectiveCharacters,
		activeSpeaker: ctx.activeSpeaker,
		recentTurns: ctx.turns,
		mode: ctx.chat.mode,
		moodTags: ctx.params?.moodTags,
		responseLength: ctx.params?.responseLength,
		feelText: ctx.params?.feelText,
		globalNote: settings.globalNote,
		currentLocation,
		locationOverrides,
		locations: ctx.locations,
		speakerMemories: ctx.accessibleMemories,
		otherCharMemories: otherCharMemoriesRegen,
	});

	const systemPromptText = messages[0]?.content ?? '';

	ctx.messages = messages;
	ctx.resolvedModel = resolvedModel;
	ctx.systemPromptText = systemPromptText;

	return {
		systemPromptLength: systemPromptText.length,
		injectedMemoryIds: ctx.relevantMemories.map((m) => m.id),
		activeSpeakerId: ctx.activeSpeaker,
		currentLocationId: ctx.chatState.currentLocationId,
		moodTagCount: (ctx.params?.moodTags ?? []).length,
	};
};
