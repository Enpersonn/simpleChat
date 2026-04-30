import { streamChat } from "../../../../../agents/ollama";
import type { GenerationContext } from "../../../types";

export const runLlmStep = async (ctx: GenerationContext) => {
  const fullText = await streamChat({
    messages: ctx.messages,
    model: ctx.resolvedModel,
    temperature: ctx.params?.temperature,
    top_p: ctx.params?.top_p,
    top_k: ctx.params?.top_k,
    repeat_penalty: ctx.params?.repeat_penalty,
    onChunk: (chunk) => {
      ctx.reply.raw.write(`${JSON.stringify({ content: chunk })}\n`);
    },
  });

  ctx.assistantText = fullText;

  return {
    model: ctx.resolvedModel,
    tokenCount: fullText.split(/\s+/).length,
  };
};
