import { findRelevantMemories } from '../../../../../LLM/memory-retrieval.js';
import type { GenerationContext } from '../../../types.js';

export async function retrieveMemoriesStep(ctx: GenerationContext) {
	ctx.activeSpeaker = ctx.chat.activeSpeakers[0] ?? 'narrator';

	const speakerIndex =
		ctx.activeSpeaker === 'narrator'
			? -1
			: ctx.characters.findIndex((c) => c.id === ctx.activeSpeaker);

	ctx.accessibleMemories =
		speakerIndex >= 0 ? ctx.characterChains[speakerIndex] : [];

	if (ctx.kind === 'opener') {
		ctx.relevantMemories = ctx.accessibleMemories;
		ctx.memoryReasons = Object.fromEntries(
			ctx.relevantMemories.map((m) => [m.id, 'always_include']),
		);

		return {
			accessibleCount: ctx.accessibleMemories.length,
			llmFallbackFired: false,
			results: ctx.relevantMemories.map((m) => ({
				memoryId: m.id,
				reason: 'always_include',
				summary: m.summary.slice(0, 100),
				tags: m.tags,
			})),
		};
	}

	const result = await findRelevantMemories(
		ctx.accessibleMemories,
		ctx.turns,
	);

	ctx.relevantMemories = result.memories;
	ctx.memoryReasons = result.reasons;

	return {
		accessibleCount: ctx.accessibleMemories.length,
		llmFallbackFired: result.llmFallbackFired,
		results: result.details.map((d) => ({
			memoryId: d.memory.id,
			reason: d.reason,
			score: d.score,
			summary: d.memory.summary.slice(0, 100),
			tags: d.memory.tags,
		})),
	};
}
