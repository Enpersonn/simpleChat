import { createService, silentStep, step } from '../../../../core/pipeline.js';
import type { GenerationContext, GenerationInput } from '../../types';
import { createGenerationContext } from './create-generation-context';
import { createGenerationStream } from './generation-stream';
import { assembleContextStep } from './steps/assemble-context.step';
import { extractStateStep } from './steps/extraction.step';
import { runAgentStep } from './steps/agent-loop.step';
import { applyMemoryChainStep } from './steps/memory-chain.step';
import { retrieveMemoriesStep } from './steps/memory-retrival.step';
import { persistAssistantTurn } from './steps/persist-result.step';
import { prepareTurns } from './steps/prepare-turns';

const chatPipeline = createService<GenerationContext>([
	step('memory_chain', applyMemoryChainStep),
	step('memory_retrieval', retrieveMemoriesStep),
	step('context_assembly', assembleContextStep),
	step('llm_call', runAgentStep),
	step('persist_result', persistAssistantTurn),
	silentStep('extraction', extractStateStep, (ctx) => ctx.kind === 'message'),
]);

export const chatGenerationService = {
	async run(input: GenerationInput): Promise<void> {
		const stream = createGenerationStream(input.req, input.reply);
		try {
			const ctx = await createGenerationContext(input, stream);
			await prepareTurns(ctx);
			await chatPipeline.run(ctx);
		} catch (error) {
			stream.error(error);
		}
	},
};
