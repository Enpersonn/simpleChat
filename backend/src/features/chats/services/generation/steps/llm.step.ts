import { streamChat } from "../../../../../ollama";
import type { GenerationContext } from "../../../types";

export const runLlmStep = async (ctx: GenerationContext) => {
  ctx.stream.pipeline("llm_call", "start");
  const startedAt = Date.now();

  let fullText = "";
  try {
    fullText = await streamChat({
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
  } catch (err) {
    ctx.stream.pipeline("llm_call", "error", startedAt);
    const msg = err instanceof Error ? err.message : "Stream error";
    ctx.stream.error({ error: msg });
    ctx.reply.raw.end();
    return;
  }

  ctx.assistantText = fullText;

  ctx.stream.pipeline("llm_call", "complete", startedAt, {
    model: ctx.resolvedModel,
    tokenCount: fullText.split(/\s+/).length,
    durationMs: Date.now() - startedAt,
  });
};
