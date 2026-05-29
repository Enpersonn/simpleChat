import { createSkillRunner, defineSkill } from '@llm-helpers/skills';
import type { SkillContext } from '@llm-helpers/types';
import { z } from 'zod';
import type { GenerationContext } from '../../types.js';
import { buildContextSnapshot } from './generation-context.js';
import { runAgentStep } from './steps/agent-loop.step.js';
import { assembleContextStep } from './steps/assemble-context.step.js';
import { extractStateStep } from './steps/extraction.step.js';
import { applyMemoryChainStep } from './steps/memory-chain.step.js';
import { retrieveMemoriesStep } from './steps/memory-retrival.step.js';
import { persistAssistantTurn } from './steps/persist-result.step.js';
import { prepareTurns } from './steps/prepare-turns.js';

type ChatSkillMetadata = {
	generationContext: GenerationContext;
};

function getGenerationContext(skillCtx: SkillContext): GenerationContext {
	const metadata = skillCtx.metadata as ChatSkillMetadata | undefined;
	if (!metadata?.generationContext) {
		throw new Error('Missing generation context for chat skill runner');
	}
	return metadata.generationContext;
}

function toPayload(result: unknown): object | undefined {
	if (
		result !== null &&
		typeof result === 'object' &&
		!Array.isArray(result)
	) {
		return result as object;
	}
	return undefined;
}

const loadSkill = defineSkill({
	description: 'Expose the preloaded chat generation dataset.',
	execute: async (_args, skillCtx) => {
		const ctx = getGenerationContext(skillCtx);
		return {
			characterCount: ctx.characters.length,
			locationCount: ctx.locations.length,
			turnCount: ctx.originalTurns.length,
		};
	},
	input: z.object({}),
	name: 'chat.load',
});

const prepareTurnsSkill = defineSkill({
	description: 'Persist the user turn or regenerate state before generation.',
	execute: async (_args, skillCtx) => {
		const ctx = getGenerationContext(skillCtx);
		await prepareTurns(ctx);
		return {
			kind: ctx.kind,
			turnCount: ctx.turns.length,
		};
	},
	input: z.object({}),
	name: 'chat.prepareTurns',
});

const resolveMemoryChainsSkill = defineSkill({
	description: 'Resolve effective character state from memory chains.',
	execute: async (_args, skillCtx) => {
		const ctx = getGenerationContext(skillCtx);
		return applyMemoryChainStep(ctx);
	},
	input: z.object({}),
	name: 'chat.resolveMemoryChains',
});

const retrieveMemoriesSkill = defineSkill({
	description: 'Select relevant memories for the active speaker.',
	execute: async (_args, skillCtx) => {
		const ctx = getGenerationContext(skillCtx);
		return retrieveMemoriesStep(ctx);
	},
	input: z.object({}),
	name: 'chat.retrieveRelevantMemories',
});

const assembleContextSkill = defineSkill({
	description: 'Assemble the final model context.',
	execute: async (_args, skillCtx) => {
		const ctx = getGenerationContext(skillCtx);
		const result = await assembleContextStep(ctx);
		ctx.stream.debug('llm', {
			model: ctx.resolvedModel,
			systemPrompt: ctx.systemPromptText,
		});
		ctx.stream.debug('context_snapshot', buildContextSnapshot(ctx));
		return result;
	},
	input: z.object({}),
	name: 'chat.assembleContext',
});

const generateReplySkill = defineSkill({
	description: 'Run the tool-using assistant agent and stream its reply.',
	execute: async (_args, skillCtx) => {
		const ctx = getGenerationContext(skillCtx);
		return runAgentStep(ctx);
	},
	input: z.object({}),
	name: 'chat.generateReply',
});

const persistReplySkill = defineSkill({
	description: 'Persist the assistant reply turn.',
	execute: async (_args, skillCtx) => {
		const ctx = getGenerationContext(skillCtx);
		return persistAssistantTurn(ctx);
	},
	input: z.object({}),
	name: 'chat.persistReply',
});

const extractStateSkill = defineSkill({
	description: 'Run post-turn extraction and update story state.',
	execute: async (_args, skillCtx) => {
		const ctx = getGenerationContext(skillCtx);
		if (ctx.kind !== 'message') return {};
		return extractStateStep(ctx);
	},
	input: z.object({}),
	name: 'chat.extractState',
});

const respondSkill = defineSkill({
	description: 'Full chat generation workflow.',
	async execute(_args, skillCtx) {
		const ctx = getGenerationContext(skillCtx);

		const runSubSkill = async (
			skillName:
				| 'chat.load'
				| 'chat.prepareTurns'
				| 'chat.resolveMemoryChains'
				| 'chat.retrieveRelevantMemories'
				| 'chat.assembleContext'
				| 'chat.generateReply'
				| 'chat.persistReply'
				| 'chat.extractState',
			pipelineStep?: string,
		) => {
			ctx.stream.skillCall({ args: {}, name: skillName });
			const startedAt = pipelineStep ? Date.now() : undefined;
			if (pipelineStep) {
				ctx.stream.pipeline(pipelineStep, 'start');
			}

			try {
				const result = await skillCtx.skill(skillName, {});
				ctx.stream.skillResult({ name: skillName, output: result });
				if (pipelineStep) {
					ctx.stream.pipeline(
						pipelineStep,
						'complete',
						startedAt,
						toPayload(result),
					);
				}
				return result;
			} catch (error) {
				if (pipelineStep) {
					ctx.stream.pipeline(pipelineStep, 'error', startedAt);
				}
				throw error;
			}
		};

		await runSubSkill('chat.load', 'data_load');
		await runSubSkill('chat.prepareTurns', 'prepare_turns');
		await runSubSkill('chat.resolveMemoryChains', 'memory_chain');
		await runSubSkill('chat.retrieveRelevantMemories', 'memory_retrieval');
		await runSubSkill('chat.assembleContext', 'context_assembly');
		await runSubSkill('chat.generateReply', 'llm_call');
		await runSubSkill('chat.persistReply', 'persist_result');
		await runSubSkill('chat.extractState', 'extraction');

		return {
			assistantText: ctx.assistantText,
		};
	},
	input: z.object({}),
	name: 'chat.respond',
});

export function createChatSkillRunner(ctx: GenerationContext) {
	return createSkillRunner({
		metadata: {
			generationContext: ctx,
		},
		skills: [
			loadSkill,
			prepareTurnsSkill,
			resolveMemoryChainsSkill,
			retrieveMemoriesSkill,
			assembleContextSkill,
			generateReplySkill,
			persistReplySkill,
			extractStateSkill,
			respondSkill,
		],
	});
}
