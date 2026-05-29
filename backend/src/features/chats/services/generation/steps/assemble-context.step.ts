import type { MemoryItem } from '@simplechat/types';
import { getSettings } from '../../../../../config.js';
import { assembleContext } from '../../../../../LLM/context.js';
import { activeModel } from '../../../../../LLM/ollama.js';
import type { GenerationContext } from '../../../types.js';

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

	const volatileSpeakerState =
		ctx.activeSpeaker !== 'narrator'
			? ctx.chatState.volatileState?.[ctx.activeSpeaker]
			: undefined;

	const messages = assembleContext({
		activeHooks: ctx.chatState.activeHooks,
		activeSpeaker: ctx.activeSpeaker,
		characters: ctx.effectiveCharacters,
		currentLocation,
		feelText: ctx.params?.feelText,
		globalNote: settings.globalNote,
		locationOverrides,
		locations: ctx.locations,
		mode: ctx.chat.mode,
		moodTags: ctx.params?.moodTags,
		narrativePressure: ctx.chatState.narrativePressure,
		otherCharMemories: otherCharMemoriesRegen,
		recentTurns: ctx.turns,
		responseLength: ctx.params?.responseLength,
		speakerMemories: ctx.accessibleMemories,
		story: ctx.story,
		volatileSpeakerState,
	});

	const systemPromptText = messages[0]?.content ?? '';

	ctx.messages = messages;
	ctx.resolvedModel = resolvedModel;
	ctx.systemPromptText = systemPromptText;

	return {
		activeSpeakerId: ctx.activeSpeaker,
		currentLocationId: ctx.chatState.currentLocationId,
		injectedMemoryIds: ctx.relevantMemories.map((m) => m.id),
		moodTagCount: (ctx.params?.moodTags ?? []).length,
		systemPromptLength: systemPromptText.length,
	};
};
