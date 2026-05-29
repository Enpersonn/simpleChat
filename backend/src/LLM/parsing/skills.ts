import {
	createSkillRunner,
	defineSkill,
	type SkillRunner,
} from '@llm-helpers/skills';
import type { ToolSystem } from '@llm-helpers/tools';
import type { SkillContext } from '@llm-helpers/types';
import { z } from 'zod';
import type { ParsingMcpPolicy } from './chunked-pass.js';
import {
	buildParsingIndex,
	type EntityManifest,
	isParsingIndex,
	type ParsingIndex,
} from './indexing.js';
import {
	type NormalisedCharacter,
	type NormalisedLocation,
	type NormalisedMemory,
	type NormalisedStoryCore,
	runStoryCensusStage,
	runStoryCharactersStage,
	runStoryCoreStage,
	runStoryIdentitiesStage,
	runStoryLocationsStage,
	runStoryMemoriesStage,
	runStoryRelationshipsStage,
	type StoryStageRuntimeContext,
} from './stages.js';
import type { ParseTraceEmitter } from './trace-types.js';
import type { ParseVerboseCallback } from './verbose-types.js';

export interface MultiPassResult {
	storyCore: NormalisedStoryCore;
	characters: NormalisedCharacter[];
	locations: NormalisedLocation[];
	memories: NormalisedMemory[];
}

function getStageRuntimeContext(ctx: SkillContext): StoryStageRuntimeContext {
	return {
		mcpPolicy: ctx.metadata?.mcpPolicy as ParsingMcpPolicy | undefined,
		onProgress: ctx.metadata?.onProgress as
			| import('./pipeline.js').ParseProgressCallback
			| undefined,
		onVerbose: ctx.metadata?.onVerbose as ParseVerboseCallback | undefined,
		signal: ctx.signal,
		trace: ctx.metadata?.trace as ParseTraceEmitter | undefined,
	};
}

async function ensureParsingIndexFromSkill(
	ctx: SkillContext,
	args: {
		chunks?: string[];
		index?: unknown;
		sanitizedText?: string;
	},
): Promise<ParsingIndex> {
	if (isParsingIndex(args.index)) {
		return args.index;
	}
	return buildParsingIndex(
		{
			chunks: args.chunks ?? [],
			sanitizedText: args.sanitizedText ?? '',
		},
		getStageRuntimeContext(ctx),
	);
}

async function emitSkillEvent(
	trace: ParseTraceEmitter | undefined,
	kind: 'skill_call' | 'skill_result' | 'skill_error',
	name: string,
	stage: string,
	payload: Record<string, unknown> = {},
) {
	await trace?.emit({
		kind,
		payload: { name, ...payload },
		stage,
	});
}

const censusSkill = defineSkill({
	description:
		'Enumerate all named characters, locations, and scenes in the story text.',
	execute: async (
		{ chunks, index, sanitizedText },
		ctx,
	): Promise<EntityManifest> => {
		const parsingIndex = await ensureParsingIndexFromSkill(ctx, {
			chunks,
			index,
			sanitizedText,
		});
		return runStoryCensusStage(
			{ index: parsingIndex },
			getStageRuntimeContext(ctx),
		);
	},
	input: z.object({
		chunks: z.array(z.string()).default([]),
		index: z.unknown().optional(),
		sanitizedText: z.string().optional(),
	}),
	name: 'story.census',
});

const indexSkill = defineSkill({
	description: 'Build the shared parsing index used by every story stage.',
	execute: async ({ chunks, sanitizedText }, ctx): Promise<ParsingIndex> =>
		buildParsingIndex(
			{
				chunks,
				sanitizedText,
			},
			getStageRuntimeContext(ctx),
		),
	input: z.object({
		chunks: z.array(z.string()).default([]),
		sanitizedText: z.string(),
	}),
	name: 'story.index',
});

const storyCoreSkill = defineSkill({
	description:
		'Extract title, premise, genres, tone, themes, writing style, and rules.',
	execute: async (
		{ chunks, index, premise, sanitizedText },
		ctx,
	): Promise<NormalisedStoryCore> => {
		const parsingIndex = await ensureParsingIndexFromSkill(ctx, {
			chunks,
			index,
			sanitizedText,
		});
		return runStoryCoreStage(
			{ index: parsingIndex, premise },
			getStageRuntimeContext(ctx),
		);
	},
	input: z.object({
		chunks: z.array(z.string()).default([]),
		index: z.unknown().optional(),
		premise: z.string().optional(),
		sanitizedText: z.string().optional(),
	}),
	name: 'story.core',
});

const locationsSkill = defineSkill({
	description:
		'Extract and deduplicate all named locations from chunked story text.',
	execute: async (
		{ chunks, index, premise, sanitizedText },
		ctx,
	): Promise<NormalisedLocation[]> => {
		const parsingIndex = await ensureParsingIndexFromSkill(ctx, {
			chunks,
			index,
			sanitizedText,
		});
		return runStoryLocationsStage(
			{ index: parsingIndex, premise },
			getStageRuntimeContext(ctx),
		);
	},
	input: z.object({
		chunks: z.array(z.string()).default([]),
		index: z.unknown().optional(),
		premise: z.string().optional(),
		sanitizedText: z.string().optional(),
	}),
	name: 'story.locations',
});

const charactersSkill = defineSkill({
	description:
		'Deep-dive extract of each named character using a deterministic worker queue.',
	execute: async (
		{ chunks, characterNames, index, premise, sanitizedText },
		ctx,
	): Promise<NormalisedCharacter[]> => {
		const parsingIndex = await ensureParsingIndexFromSkill(ctx, {
			chunks,
			index,
			sanitizedText,
		});
		return runStoryCharactersStage(
			{ characterNames, index: parsingIndex, premise },
			getStageRuntimeContext(ctx),
		);
	},
	input: z.object({
		characterNames: z.array(z.string()),
		chunks: z.array(z.string()).default([]),
		index: z.unknown().optional(),
		premise: z.string().optional(),
		sanitizedText: z.string().optional(),
	}),
	name: 'story.characters',
});

const relationshipsSkill = defineSkill({
	description:
		'Extract chunk-level relationship evidence and merge it by pair.',
	execute: async (
		{ characters, chunks, index, premise, sanitizedText },
		ctx,
	): Promise<NormalisedCharacter[]> => {
		const parsingIndex = await ensureParsingIndexFromSkill(ctx, {
			chunks,
			index,
			sanitizedText,
		});
		return runStoryRelationshipsStage(
			{
				characters: characters as NormalisedCharacter[],
				index: parsingIndex,
				premise,
			},
			getStageRuntimeContext(ctx),
		);
	},
	input: z.object({
		characters: z.array(z.unknown()),
		chunks: z.array(z.string()).default([]),
		index: z.unknown().optional(),
		premise: z.string().optional(),
		sanitizedText: z.string().optional(),
	}),
	name: 'story.relationships',
});

const memoriesSkill = defineSkill({
	description:
		'Extract the chronological timeline of memory events for all characters.',
	execute: async (
		{ characters, chunks, index, premise, sanitizedText },
		ctx,
	): Promise<NormalisedMemory[]> => {
		const parsingIndex = await ensureParsingIndexFromSkill(ctx, {
			chunks,
			index,
			sanitizedText,
		});
		return runStoryMemoriesStage(
			{
				characters: characters as NormalisedCharacter[],
				index: parsingIndex,
				premise,
			},
			getStageRuntimeContext(ctx),
		);
	},
	input: z.object({
		characters: z.array(z.unknown()),
		chunks: z.array(z.string()).default([]),
		index: z.unknown().optional(),
		premise: z.string().optional(),
		sanitizedText: z.string().optional(),
	}),
	name: 'story.memories',
});

const identitiesSkill = defineSkill({
	description:
		'Resolve cross-character identity links and alternate personas from chunk evidence.',
	execute: async (
		{ characters, chunks, index, premise, sanitizedText },
		ctx,
	): Promise<NormalisedCharacter[]> => {
		const parsingIndex = await ensureParsingIndexFromSkill(ctx, {
			chunks,
			index,
			sanitizedText,
		});
		return runStoryIdentitiesStage(
			{
				characters: characters as NormalisedCharacter[],
				index: parsingIndex,
				premise,
			},
			getStageRuntimeContext(ctx),
		);
	},
	input: z.object({
		characters: z.array(z.unknown()),
		chunks: z.array(z.string()).default([]),
		index: z.unknown().optional(),
		premise: z.string().optional(),
		sanitizedText: z.string().optional(),
	}),
	name: 'story.identities',
});

const parseStorySkill = defineSkill({
	description: 'Full multi-pass story parsing pipeline.',
	async execute(
		{ sanitizedText, chunks, premise },
		ctx,
	): Promise<MultiPassResult> {
		const runtime = getStageRuntimeContext(ctx);
		const trace = runtime.trace;

		const markStage = async (
			stage: string,
			status: 'start' | 'complete' | 'error',
			data: Record<string, unknown> = {},
		) => {
			runtime.onProgress?.(stage, status, data);
			if (status === 'start') {
				await trace?.setStage(stage);
				await trace?.emit({
					kind: 'stage_start',
					payload: data,
					stage,
				});
				return;
			}
			await trace?.emit({
				kind: status === 'complete' ? 'stage_complete' : 'stage_error',
				payload: data,
				stage,
			});
		};

		const invokeSkill = async <TValue>(
			name: string,
			stage: string,
			args: Record<string, unknown>,
		): Promise<TValue> => {
			await emitSkillEvent(trace, 'skill_call', name, stage, { args });
			try {
				const value = (await ctx.skill(name, args)) as TValue;
				await emitSkillEvent(trace, 'skill_result', name, stage, {
					resultType: Array.isArray(value) ? 'array' : typeof value,
				});
				return value;
			} catch (error) {
				await emitSkillEvent(trace, 'skill_error', name, stage, {
					message:
						error instanceof Error ? error.message : String(error),
				});
				throw error;
			}
		};

		await markStage('story.index', 'start', {
			chunkCount: chunks.length,
		});
		const index = await invokeSkill<ParsingIndex>(
			'story.index',
			'story.index',
			{
				chunks,
				sanitizedText,
			},
		);
		await markStage('story.index', 'complete', {
			characterCount: index.manifest.characterNames.length,
			chunkCount: index.chunks.length,
			locationCount: index.manifest.locationNames.length,
			sceneCount: index.manifest.sceneNames.length,
		});

		await markStage('story.census', 'start', {});
		const manifest = await invokeSkill<EntityManifest>(
			'story.census',
			'story.census',
			{
				index,
			},
		);
		await markStage('story.census', 'complete', {
			characterCount: manifest.characterNames.length,
			locationCount: manifest.locationNames.length,
			sceneCount: manifest.sceneNames.length,
		});

		await markStage('story.core+locations', 'start', {});
		const [storyCore, locations] = await Promise.all([
			invokeSkill<NormalisedStoryCore>(
				'story.core',
				'story.core+locations',
				{
					index,
					premise,
				},
			),
			invokeSkill<NormalisedLocation[]>(
				'story.locations',
				'story.core+locations',
				{
					index,
					premise,
				},
			),
		]);
		await trace?.replacePartial({
			slice: 'storyCore',
			stage: 'story.core+locations',
			value: storyCore,
		});
		await trace?.replacePartial({
			slice: 'locations',
			stage: 'story.core+locations',
			value: locations,
		});
		await markStage('story.core+locations', 'complete', {
			locationCount: locations.length,
			locations,
			storyCore,
		});

		if (manifest.characterNames.length === 0) {
			await trace?.setStage(null);
			return { characters: [], locations, memories: [], storyCore };
		}

		await markStage('story.characters', 'start', {
			count: manifest.characterNames.length,
		});
		const rawCharacters = await invokeSkill<NormalisedCharacter[]>(
			'story.characters',
			'story.characters',
			{
				characterNames: manifest.characterNames,
				index,
				premise,
			},
		);
		await markStage('story.characters', 'complete', {
			characters: rawCharacters,
			count: rawCharacters.length,
		});

		await markStage('story.relationships', 'start', {});
		const charactersWithRelationships = await invokeSkill<
			NormalisedCharacter[]
		>('story.relationships', 'story.relationships', {
			characters: rawCharacters,
			index,
			premise,
		});
		await trace?.replacePartial({
			slice: 'characters',
			stage: 'story.relationships',
			value: charactersWithRelationships,
		});
		await markStage('story.relationships', 'complete', {});

		await markStage('story.memories', 'start', {});
		const memories = await invokeSkill<NormalisedMemory[]>(
			'story.memories',
			'story.memories',
			{
				characters: charactersWithRelationships,
				index,
				premise,
			},
		);
		await trace?.replacePartial({
			slice: 'memories',
			stage: 'story.memories',
			value: memories,
		});
		await markStage('story.memories', 'complete', {
			count: memories.length,
			memories,
		});

		await markStage('story.identities', 'start', {});
		const characters = await invokeSkill<NormalisedCharacter[]>(
			'story.identities',
			'story.identities',
			{
				characters: charactersWithRelationships,
				index,
				premise,
			},
		);
		await trace?.replacePartial({
			slice: 'characters',
			stage: 'story.identities',
			value: characters,
		});
		await markStage('story.identities', 'complete', {});
		await trace?.setStage(null);

		return { characters, locations, memories, storyCore };
	},
	input: z.object({
		chunks: z.array(z.string()),
		premise: z.string().optional(),
		sanitizedText: z.string(),
	}),
	name: 'story.parse',
	needs: {
		skills: [
			'story.index',
			'story.census',
			'story.core',
			'story.locations',
			'story.characters',
			'story.relationships',
			'story.memories',
			'story.identities',
		],
	},
});

export function createParsingSkillRunner(
	opts: {
		mcpPolicy?: ParsingMcpPolicy;
		tools?: ToolSystem;
		onProgress?: import('./pipeline.js').ParseProgressCallback;
		onVerbose?: ParseVerboseCallback;
		trace?: ParseTraceEmitter;
	} = {},
): SkillRunner {
	const metadata: Record<string, unknown> = {};
	if (opts.mcpPolicy) metadata.mcpPolicy = opts.mcpPolicy;
	if (opts.onProgress) metadata.onProgress = opts.onProgress;
	if (opts.onVerbose) metadata.onVerbose = opts.onVerbose;
	if (opts.trace) metadata.trace = opts.trace;

	return createSkillRunner({
		metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
		skills: [
			indexSkill,
			censusSkill,
			storyCoreSkill,
			locationsSkill,
			charactersSkill,
			relationshipsSkill,
			memoriesSkill,
			identitiesSkill,
			parseStorySkill,
		],
		tools: opts.tools,
	});
}
