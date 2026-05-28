import type { normaliseCharacter, normaliseLocation, normaliseMemoryItem, normaliseStoryCore } from '../normalizers.js';
import { chunkText, sanitizeTextForParsing } from './sanitize.js';
import type { ParseContext } from './service.js';
import { createParsingSkillRunner } from './skills.js';
import type { ParseVerboseCallback } from './verbose-types.js';

export type MultiPassResult = {
	storyCore: ReturnType<typeof normaliseStoryCore>;
	characters: ReturnType<typeof normaliseCharacter>[];
	locations: ReturnType<typeof normaliseLocation>[];
	memories: ReturnType<typeof normaliseMemoryItem>[];
};

export type ParseProgressCallback = (
	stage: string,
	status: 'start' | 'complete' | 'error',
	data?: Record<string, unknown>,
) => void;

// Lazy singleton — only used when no progress/verbose callbacks are needed
let _runner: ReturnType<typeof createParsingSkillRunner> | undefined;

export async function parseStoryMultiPass(
	text: string,
	ctx?: ParseContext,
	onProgress?: ParseProgressCallback,
	onVerbose?: ParseVerboseCallback,
): Promise<MultiPassResult> {
	const sanitized = sanitizeTextForParsing(text);
	const chunks = chunkText(sanitized);
	let runner: ReturnType<typeof createParsingSkillRunner>;
	if (onProgress || onVerbose) {
		runner = createParsingSkillRunner({ onProgress, onVerbose });
	} else {
		if (!_runner) _runner = createParsingSkillRunner();
		runner = _runner;
	}
	const result = await runner.run('story.parse', {
		chunks,
		premise: ctx?.premise,
		sanitizedText: sanitized,
	});
	return result as MultiPassResult;
}
