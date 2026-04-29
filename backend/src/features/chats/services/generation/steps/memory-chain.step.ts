import { applyMemoryChain } from "../../../../../character-state";
import { buildChainDiffs, resolveCharacterChains } from "../../../helpers";
import type { GenerationContext } from "../../../types";

export async function applyMemoryChainStep(ctx: GenerationContext) {
  const startedAt = Date.now();
  ctx.stream.pipeline("memory_chain", "start", startedAt);

  ctx.characterChains = await resolveCharacterChains(
    ctx.characters,
    ctx.chat.memoryTimelineCutoff,
  );

  ctx.effectiveCharacters = ctx.characters.map((character, index) => {
    const chain = ctx.characterChains[index];
    return chain.length > 0 ? applyMemoryChain(character, chain) : character;
  });

  ctx.stream.pipeline("memory_chain", "complete", startedAt, {
    chains: buildChainDiffs(
      ctx.characters,
      ctx.effectiveCharacters,
      ctx.characterChains,
    ),
  });
}
