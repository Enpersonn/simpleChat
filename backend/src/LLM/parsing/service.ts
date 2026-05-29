import { buildParsingIndex } from './indexing.js';
import { parseStoryMultiPass } from './pipeline.js';
import { chunkText, sanitizeTextForParsing } from './sanitize.js';
import {
	runStoryCensusStage,
	runStoryCharactersStage,
	runStoryCoreStage,
	runStoryLocationsStage,
	runStoryMemoriesStage,
	runStoryRelationshipsStage,
	type StoryStageRuntimeContext,
} from './stages.js';

export type ParseType =
	| 'story-core'
	| 'story-characters'
	| 'story-locations'
	| 'story-memories'
	| 'multi-pass';

export interface ParseContext {
	premise?: string;
	characterNames?: string[];
}

const localStageContext: StoryStageRuntimeContext = {};

export async function parseEntities(
	type: ParseType,
	text: string,
	ctx?: ParseContext,
): Promise<Record<string, unknown>> {
	switch (type) {
		case 'story-core': {
			const sanitized = sanitizeTextForParsing(text);
			const chunks = chunkText(sanitized);
			const index = await buildParsingIndex(
				{ chunks, sanitizedText: sanitized },
				localStageContext,
			);
			await runStoryCensusStage({ index }, localStageContext);
			const storyCore = await runStoryCoreStage(
				{
					index,
					premise: ctx?.premise,
				},
				localStageContext,
			);
			return storyCore as unknown as Record<string, unknown>;
		}

		case 'story-characters': {
			const sanitized = sanitizeTextForParsing(text);
			const chunks = chunkText(sanitized);
			const index = await buildParsingIndex(
				{ chunks, sanitizedText: sanitized },
				localStageContext,
			);
			const manifest = await runStoryCensusStage(
				{ index },
				localStageContext,
			);
			const baseCharacters = await runStoryCharactersStage(
				{
					characterNames: ctx?.characterNames?.length
						? ctx.characterNames
						: manifest.characterNames,
					index,
					premise: ctx?.premise,
				},
				localStageContext,
			);
			const characters = await runStoryRelationshipsStage(
				{
					characters: baseCharacters,
					index,
					premise: ctx?.premise,
				},
				localStageContext,
			);
			return { characters };
		}

		case 'story-locations': {
			const sanitized = sanitizeTextForParsing(text);
			const chunks = chunkText(sanitized);
			const index = await buildParsingIndex(
				{ chunks, sanitizedText: sanitized },
				localStageContext,
			);
			const locations = await runStoryLocationsStage(
				{
					index,
					premise: ctx?.premise,
				},
				localStageContext,
			);
			return { locations };
		}

		case 'story-memories': {
			const sanitized = sanitizeTextForParsing(text);
			const chunks = chunkText(sanitized);
			const index = await buildParsingIndex(
				{ chunks, sanitizedText: sanitized },
				localStageContext,
			);
			const manifest = await runStoryCensusStage(
				{ index },
				localStageContext,
			);
			const characters = await runStoryCharactersStage(
				{
					characterNames: ctx?.characterNames?.length
						? ctx.characterNames
						: manifest.characterNames,
					index,
					premise: ctx?.premise,
				},
				localStageContext,
			);
			const memories = await runStoryMemoriesStage(
				{
					characters,
					index,
					premise: ctx?.premise,
				},
				localStageContext,
			);
			return { memories };
		}

		case 'multi-pass': {
			return parseStoryMultiPass(text, ctx) as unknown as Promise<
				Record<string, unknown>
			>;
		}
	}
}
