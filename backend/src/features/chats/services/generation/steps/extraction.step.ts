import { runExtraction } from '../../../../../LLM/extraction';
import { characters_store } from '../../../../characters/store';
import { locations_store } from '../../../../locations/store';
import { memories_store } from '../../../../memories/store/index';
import { generateLocationFromContext } from '../../../helpers';
import { chat_state_store } from '../../../store';
import type { GenerationContext } from '../../../types';

export const extractStateStep = async (ctx: GenerationContext) => {
	if (!ctx.assistantText || (ctx.locations.length === 0 && ctx.characters.length === 0)) return;

	const extracted = await runExtraction({
		activeSpeakers: ctx.chat.activeSpeakers,
		characters: ctx.characters,
		chatId: ctx.chatId,
		currentState: ctx.chatState,
		locations: ctx.locations,
		recentTurns: ctx.turns.slice(-6),
		story: ctx.story,
		storyId: ctx.storyId,
	});

	// ── Location: handle new location creation ────────────────────────────────
	let finalLocationId = extracted.currentLocationId;
	let newLocationCreated = false;

	if (extracted.newLocationName) {
		const newLocFields = await generateLocationFromContext(
			extracted.newLocationName,
			ctx.story,
			ctx.turns.slice(-4),
		);
		const newLoc = await locations_store.add({
			storyId: ctx.storyId,
			...newLocFields,
		});
		ctx.locations.push(newLoc);
		finalLocationId = newLoc.id;
		newLocationCreated = true;
	}

	// ── Volatile character state ───────────────────────────────────────────────
	const newVolatileState = { ...ctx.chatState.volatileState };
	for (const [charId, state] of Object.entries(extracted.volatileStateUpdates)) {
		newVolatileState[charId] = state;
	}

	// ── Narrative pressure ─────────────────────────────────────────────────────
	const rawPressure = (ctx.chatState.narrativePressure ?? 0) + extracted.pressureDelta - 5;
	const newPressure = Math.max(0, Math.min(100, rawPressure));

	const resolvedSet = new Set(extracted.resolvedHooks);
	const newHooks = [
		...ctx.chatState.activeHooks.filter((h) => !resolvedSet.has(h)),
		...extracted.newHooks,
	].slice(0, 8);

	// ── Persist chat state ────────────────────────────────────────────────────
	const finalState = {
		...extracted,
		activeHooks: newHooks,
		currentLocationId: newLocationCreated ? finalLocationId : extracted.currentLocationId,
		locationOverrides: newLocationCreated ? {} : extracted.locationOverrides,
		narrativePressure: newPressure,
		volatileState: newVolatileState,
	};

	await chat_state_store.update(ctx.chatId, finalState);

	// ── Relationship updates ───────────────────────────────────────────────────
	for (const update of extracted.relationshipUpdates) {
		const char = ctx.characters.find((c) => c.id === update.fromCharId);
		if (!char) continue;
		const edgeIdx = char.relationships.findIndex((r) => r.charId === update.toCharId);
		if (edgeIdx === -1) continue;

		const edge = char.relationships[edgeIdx];
		const newTrust = Math.max(0, Math.min(10, edge.trustLevel + update.trustDelta));
		const updatedEdge = {
			...edge,
			trustLevel: newTrust,
			...(update.newEmotion ? { emotion: update.newEmotion } : {}),
		};
		const updatedRelationships = [...char.relationships];
		updatedRelationships[edgeIdx] = updatedEdge;
		await characters_store.update(update.fromCharId, { relationships: updatedRelationships });
	}

	// ── Canon facts → new memory records ─────────────────────────────────────
	const lastTurn = ctx.turns.at(-1);
	for (const fact of extracted.canonFacts) {
		await memories_store.add({
			importance: fact.importance,
			sourceChatId: ctx.chatId,
			sourceTurnId: lastTurn?.id,
			storyId: ctx.storyId,
			summary: fact.summary,
			tags: fact.tags,
		});
	}

	// ── Stream state update frame (always emitted) ────────────────────────────
	const locationChanged = finalState.currentLocationId !== ctx.chatState.currentLocationId;
	const overridesChanged =
		JSON.stringify(finalState.locationOverrides) !==
		JSON.stringify(ctx.chatState.locationOverrides);

	const locationName = finalState.currentLocationId
		? (ctx.locations.find((l) => l.id === finalState.currentLocationId)?.name ?? null)
		: null;

	const volatileUpdatesMap = extracted.volatileStateUpdates;
	const hasVolatileUpdates = Object.keys(volatileUpdatesMap).length > 0;

	ctx.stream.frame({
		stateUpdate: {
			activeHooks: newHooks.length > 0 ? newHooks : undefined,
			canonFactsCreated: extracted.canonFacts.length,
			currentLocationId: finalState.currentLocationId,
			locationChanged,
			locationName,
			narrativePressure: newPressure,
			newLocationCreated,
			volatileStateUpdates: hasVolatileUpdates ? volatileUpdatesMap : undefined,
		},
	});

	return {
		canonFactsCreated: extracted.canonFacts.length,
		locationChanged,
		narrativePressure: newPressure,
		newLocationCreated,
		newLocationId: finalState.currentLocationId ?? null,
		newLocationName: extracted.newLocationName ?? null,
		overridesChanged,
		relationshipUpdates: extracted.relationshipUpdates.length,
		volatileUpdates: Object.keys(extracted.volatileStateUpdates).length,
	};
};
