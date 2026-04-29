import type { GenerationInput } from "../../types";
import { createGenerationContext } from "./create-generation-context";
import { buildContextSnapshot } from "./generation-context";
import { createGenerationStream } from "./generation-stream";
import { assembleContextStep } from "./steps/assemble-context.step";
import { extractStateStep } from "./steps/extraction.step";
import { runLlmStep } from "./steps/llm.step";
import { applyMemoryChainStep } from "./steps/memory-chain.step";
import { retrieveMemoriesStep } from "./steps/memory-retrival.step";
import { persistAssistantTurn } from "./steps/persist-result.step";
import { prepareTurns } from "./steps/prepare-turns";

export const chatGenerationService = {
  async run(input: GenerationInput): Promise<void> {
    const stream = createGenerationStream(input.req, input.reply);

    try {
      const ctx = await createGenerationContext(input, stream);

      await prepareTurns(ctx);

      await applyMemoryChainStep(ctx);
      await retrieveMemoriesStep(ctx);
      await assembleContextStep(ctx);

      // stream.emitContextSnapshot(buildContextSnapshot(ctx));
      // stream.emitDebug(ctx);

      await runLlmStep(ctx);
      await persistAssistantTurn(ctx);

      if (ctx.kind === "message") {
        await extractStateStep(ctx);
      }

      stream.done();
    } catch (error) {
      stream.error(error);
    }
  },
};
