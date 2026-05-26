import type {
	GenerationContext,
	GenerationInput,
	GenerationStream,
} from '../../types';
import { loadGenerationData } from './load-generation-data';

export async function createGenerationContext(
	input: GenerationInput,
	stream: GenerationStream,
): Promise<GenerationContext> {
	const data = await loadGenerationData(input.storyId, input.chatId);

	stream.pipeline('data_load', 'complete', undefined, {
		characterCount: data.characters.length,
		locationCount: data.locations.length,
		turnCount: data.turns,
	});
	return {
		...input,
		accessibleMemories: [],

		activeSpeaker: '',

		assistantText: '',

		characterChains: [],
		characters: data.characters,
		chat: data.chat,
		chatState: data.chatState,
		effectiveCharacters: [],
		locations: data.locations,
		memoryReasons: {},

		messages: [],

		originalTurns: data.turns,
		relevantMemories: [],
		resolvedModel: '',

		story: data.story,

		stream,
		systemPromptText: '',
		turns: [],
	};
}
