import { runExtraction } from "../../../../../agents/extraction";
import { locations_store } from "../../../../locations/store";
import { generateLocationFromContext } from "../../../helpers";
import { chat_state_store } from "../../../store";
import type { GenerationContext } from "../../../types";

export const extractStateStep = async (ctx: GenerationContext) => {
  if (!ctx.assistantText || ctx.locations.length === 0) return;

  const extracted = await runExtraction({
    recentTurns: ctx.turns.slice(-6),
    story: ctx.story,
    locations: ctx.locations,
    currentState: ctx.chatState,
  });

  let finalState = extracted;
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
    finalState = {
      ...extracted,
      currentLocationId: newLoc.id,
      locationOverrides: {},
    };
    newLocationCreated = true;
  }

  await chat_state_store.update(ctx.chatId, finalState);

  const locationChanged =
    finalState.currentLocationId !== ctx.chatState.currentLocationId;
  const overridesChanged =
    JSON.stringify(finalState.locationOverrides) !==
    JSON.stringify(ctx.chatState.locationOverrides);

  if (locationChanged || overridesChanged || newLocationCreated) {
    const locationName = finalState.currentLocationId
      ? (ctx.locations.find((l) => l.id === finalState.currentLocationId)
          ?.name ?? null)
      : null;
    ctx.stream.frame({
      stateUpdate: {
        currentLocationId: finalState.currentLocationId,
        locationName,
        newLocationCreated,
      },
    });
  }

  return {
    locationChanged,
    newLocationCreated,
    newLocationId: finalState.currentLocationId ?? null,
    newLocationName: extracted.newLocationName ?? null,
    overridesChanged,
  };
};
