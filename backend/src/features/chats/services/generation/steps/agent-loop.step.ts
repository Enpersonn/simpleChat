import { createAgent } from '@llm-helpers/an-agent-runtime-handler';
import type { LLMMessage } from '@llm-helpers/types';
import { getOllamaAdapter } from '../../../../../LLM/llm-client.js';
import { createStoryToolSystem } from '../../../../../LLM/tools/tool-system.js';
import type { GenerationContext } from '../../../types';

export const runAgentStep = async (ctx: GenerationContext) => {
	const adapter = await getOllamaAdapter();
	const tools = createStoryToolSystem();

	const agent = createAgent(adapter, tools, {
		stream: true,
		maxSteps: 10,
	});

	let fullText = '';

	agent.bus.on('token', (e) => {
		ctx.stream.content(e.text);
		fullText += e.text;
	});

	agent.bus.on('tool_call', (e) => {
		ctx.stream.toolCall({ name: e.toolName, args: e.args });
	});

	agent.bus.on('tool_result', (e) => {
		ctx.stream.toolResult({ name: e.toolName, output: e.result });
	});

	await agent.start({
		messages: ctx.messages as unknown as LLMMessage[],
		temperature: ctx.params.temperature,
	});

	ctx.assistantText = fullText;

	return {
		model: ctx.resolvedModel,
		tokenCount: fullText.split(/\s+/).length,
	};
};
