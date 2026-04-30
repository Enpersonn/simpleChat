import { findRelevantMemories } from "../../../../../agents/memory-retrieval";
import type { GenerationContext } from "../../../types";

export async function retrieveMemoriesStep(ctx: GenerationContext) {
  ctx.activeSpeaker = ctx.chat.activeSpeakers[0] ?? "narrator";

  const speakerIndex =
    ctx.activeSpeaker === "narrator"
      ? -1
      : ctx.characters.findIndex((c) => c.id === ctx.activeSpeaker);

  ctx.accessibleMemories =
    speakerIndex >= 0 ? ctx.characterChains[speakerIndex] : [];

  if (ctx.kind === "opener") {
    ctx.relevantMemories = ctx.accessibleMemories;
    ctx.memoryReasons = Object.fromEntries(
      ctx.relevantMemories.map((m) => [m.id, "always_include"]),
    );

    return {
      accessibleCount: ctx.accessibleMemories.length,
      results: ctx.relevantMemories.map((m) => ({
        memoryId: m.id,
        summary: m.summary.slice(0, 100),
        reason: "always_include",
        tags: m.tags,
      })),
      llmFallbackFired: false,
    };
  }

  const result = await findRelevantMemories(ctx.accessibleMemories, ctx.turns);

  ctx.relevantMemories = result.memories;
  ctx.memoryReasons = result.reasons;

  return {
    accessibleCount: ctx.accessibleMemories.length,
    results: result.details.map((d) => ({
      memoryId: d.memory.id,
      summary: d.memory.summary.slice(0, 100),
      reason: d.reason,
      score: d.score,
      tags: d.memory.tags,
    })),
    llmFallbackFired: result.llmFallbackFired,
  };
}
