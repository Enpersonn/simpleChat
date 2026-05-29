import {
	type ImportJobPartialResult,
	ImportJobPartialResultSchema,
} from '@simplechat/types';
import { parseStoryMultiPass } from '../../LLM/parsing/pipeline.js';
import type { ImportJobRunInput } from './manager.js';

export async function runImportJob(
	input: ImportJobRunInput,
): Promise<ImportJobPartialResult> {
	const result = await parseStoryMultiPass(input.sourceText, input.context, {
		signal: input.signal,
		trace: input.trace,
	});

	return ImportJobPartialResultSchema.parse({
		characters: result.characters,
		locations: result.locations,
		memories: result.memories,
		storyCore: result.storyCore,
	});
}

