import type { GenerationContext } from "../../types";

export function buildContextSnapshot(ctx: GenerationContext) {
  return {
    story: {
      id: ctx.story.id,
      title: ctx.story.title,
    },
    activeSpeakerId: ctx.activeSpeaker,
    characters: ctx.characters.map((base, i) => {
      const effective = ctx.effectiveCharacters[i];

      return {
        id: base.id,
        name: base.name,
        role: base.role,
        isUserPersona: base.isUserPersona,
        isNarrator: base.isNarrator,
        basePersonality: base.public.personality,
        effectivePersonality: effective.public.personality,
        baseSpeechStyle: base.public.speechStyle ?? "",
        effectiveSpeechStyle: effective.public.speechStyle ?? "",
        baseTrueMotives: base.private.trueMotives ?? "",
        effectiveTrueMotives: effective.private.trueMotives ?? "",
        baseFears: base.private.fears,
        effectiveFears: effective.private.fears,
      };
    }),
    accessibleMemories: ctx.accessibleMemories.map((m) => ({
      id: m.id,
      summary: m.summary.slice(0, 100),
      tags: m.tags,
      importance: m.importance,
    })),
    injectedMemoryIds: ctx.relevantMemories.map((m) => m.id),
    memoryReasons: ctx.memoryReasons,
    locations: ctx.locations.map((location) => ({
      id: location.id,
      name: location.name,
      isCurrent: location.id === ctx.chatState.currentLocationId,
    })),
    currentLocationId: ctx.chatState.currentLocationId,
    moodTags: ctx.params.moodTags ?? [],
    responseLength: ctx.params.responseLength ?? "medium",
    feelText: ctx.params.feelText ?? "",
    model: ctx.resolvedModel,
  };
}
