import { createAgent } from '@llm-helpers/an-agent-runtime-handler';
import type { LLMMessage } from '@llm-helpers/types';
import { createOllamaRuntime } from '../../../../../LLM/runtime.js';
import { createStoryReadToolSystem } from '../../../../../LLM/tools/tool-system.js';
import type { GenerationContext } from '../../../types.js';

export const runAgentStep = async (ctx: GenerationContext) => {
	const runtime = await createOllamaRuntime({
		model: ctx.resolvedModel,
	});
	const tools = createStoryReadToolSystem();

	const agent = createAgent(runtime.provider, tools, {
		maxSteps: 10,
		stream: true,
	});

	let fullText = '';

	agent.bus.on('token', (e) => {
		ctx.stream.content(e.text);
		fullText += e.text;
	});

	agent.bus.on('tool_call', (e) => {
		ctx.stream.toolCall({ args: e.args, name: e.toolName });
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
