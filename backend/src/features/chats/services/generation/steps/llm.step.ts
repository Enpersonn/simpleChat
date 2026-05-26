import { streamChat } from '../../../../../LLM/ollama';
import type { GenerationContext } from '../../../types';

export const runLlmStep = async (ctx: GenerationContext) => {
	const fullText = await streamChat({
		messages: ctx.messages,
		model: ctx.resolvedModel,
		onChunk: (chunk) => {
			ctx.reply.raw.write(`${JSON.stringify({ content: chunk })}\n`);
		},
		repeat_penalty: ctx.params?.repeat_penalty,
		temperature: ctx.params?.temperature,
		top_k: ctx.params?.top_k,
		top_p: ctx.params?.top_p,
	});

	ctx.assistantText = fullText;

	return {
		model: ctx.resolvedModel,
		tokenCount: fullText.split(/\s+/).length,
	};
};
