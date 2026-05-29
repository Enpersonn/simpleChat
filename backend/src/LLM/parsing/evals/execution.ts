import { buildParsingIndex, type ParsingIndex } from '../indexing.js';
import { type MultiPassResult, parseStoryMultiPass } from '../pipeline.js';
import { chunkText, sanitizeTextForParsing } from '../sanitize.js';
import {
	runStoryCensusStage,
	runStoryCharactersStage,
	runStoryCoreStage,
	runStoryIdentitiesStage,
	runStoryLocationsStage,
	runStoryMemoriesStage,
	runStoryRelationshipsStage,
	type StoryStageRuntimeContext,
} from '../stages.js';
import { BenchmarkTraceCollector, createVerboseCollector } from './trace.js';
import type {
	BenchmarkIsolatedStageOutputs,
	BenchmarkLoadedStory,
	BenchmarkRepeatResult,
	BenchmarkStageRun,
} from './types.js';

async function runIsolatedStage<TOutput>(
	repeatIndex: number,
	stageLabel: string,
	run: (context: StoryStageRuntimeContext) => Promise<TOutput>,
): Promise<BenchmarkStageRun<TOutput>> {
	const trace = new BenchmarkTraceCollector();
	const verboseCollector = createVerboseCollector(
		repeatIndex,
		'isolated',
		stageLabel,
	);
	const context: StoryStageRuntimeContext = {
		onVerbose: verboseCollector.callback,
		trace,
	};
	const startedAt = Date.now();
	await trace.emit({
		kind: 'stage_start',
		payload: { mode: 'isolated' },
		stage: stageLabel,
	});
	try {
		const output = await run(context);
		await trace.emit({
			kind: 'stage_complete',
			payload: { durationMs: Date.now() - startedAt, mode: 'isolated' },
			stage: stageLabel,
		});
		return {
			durationMs: Date.now() - startedAt,
			output,
			stageLabel,
			trace: trace.snapshot(),
			verbose: verboseCollector.records,
		};
	} catch (error) {
		await trace.emit({
			kind: 'stage_error',
			payload: {
				message: error instanceof Error ? error.message : String(error),
				mode: 'isolated',
			},
			stage: stageLabel,
		});
		throw error;
	}
}

async function runPipelineEval(
	loadedStory: BenchmarkLoadedStory,
	repeatIndex: number,
): Promise<BenchmarkStageRun<MultiPassResult>> {
	const trace = new BenchmarkTraceCollector();
	const verboseCollector = createVerboseCollector(
		repeatIndex,
		'pipeline',
		'story.parse',
	);
	const startedAt = Date.now();
	const output = await parseStoryMultiPass(
		loadedStory.text,
		loadedStory.context,
		{
			onVerbose: verboseCollector.callback,
			trace,
		},
	);
	return {
		durationMs: Date.now() - startedAt,
		output,
		stageLabel: 'story.parse',
		trace: trace.snapshot(),
		verbose: verboseCollector.records,
	};
}

async function runIsolatedStages(
	loadedStory: BenchmarkLoadedStory,
	repeatIndex: number,
): Promise<{
	outputs: BenchmarkIsolatedStageOutputs;
	runs: Record<string, BenchmarkStageRun<unknown>>;
}> {
	const sanitizedText = sanitizeTextForParsing(loadedStory.text);
	const chunks = chunkText(sanitizedText);

	const indexRun = await runIsolatedStage<ParsingIndex>(
		repeatIndex,
		'story.index',
		(context) => buildParsingIndex({ chunks, sanitizedText }, context),
	);
	const index = indexRun.output;
	const manifestRun = await runIsolatedStage(
		repeatIndex,
		'story.census',
		(context) => runStoryCensusStage({ index }, context),
	);
	const storyCoreRun = await runIsolatedStage(
		repeatIndex,
		'story.core',
		(context) =>
			runStoryCoreStage(
				{ index, premise: loadedStory.context?.premise },
				context,
			),
	);
	const locationsRun = await runIsolatedStage(
		repeatIndex,
		'story.locations',
		(context) =>
			runStoryLocationsStage(
				{ index, premise: loadedStory.context?.premise },
				context,
			),
	);
	const charactersBaseRun = await runIsolatedStage(
		repeatIndex,
		'story.characters',
		(context) =>
			runStoryCharactersStage(
				{
					characterNames: index.manifest.characterNames,
					index,
					premise: loadedStory.context?.premise,
				},
				context,
			),
	);
	const charactersWithRelationshipsRun = await runIsolatedStage(
		repeatIndex,
		'story.relationships',
		(context) =>
			runStoryRelationshipsStage(
				{
					characters: charactersBaseRun.output,
					index,
					premise: loadedStory.context?.premise,
				},
				context,
			),
	);
	const memoriesRun = await runIsolatedStage(
		repeatIndex,
		'story.memories',
		(context) =>
			runStoryMemoriesStage(
				{
					characters: charactersWithRelationshipsRun.output,
					index,
					premise: loadedStory.context?.premise,
				},
				context,
			),
	);
	const identitiesRun = await runIsolatedStage(
		repeatIndex,
		'story.identities',
		(context) =>
			runStoryIdentitiesStage(
				{
					characters: charactersWithRelationshipsRun.output,
					index,
					premise: loadedStory.context?.premise,
				},
				context,
			),
	);

	return {
		outputs: {
			charactersBase: charactersBaseRun.output,
			charactersFinal: identitiesRun.output,
			charactersWithRelationships: charactersWithRelationshipsRun.output,
			index,
			locations: locationsRun.output,
			manifest: manifestRun.output,
			memories: memoriesRun.output,
			storyCore: storyCoreRun.output,
		},
		runs: {
			'story.census': manifestRun,
			'story.characters': charactersBaseRun,
			'story.core': storyCoreRun,
			'story.identities': identitiesRun,
			'story.index': indexRun,
			'story.locations': locationsRun,
			'story.memories': memoriesRun,
			'story.relationships': charactersWithRelationshipsRun,
		},
	};
}

export async function runBenchmarkRepeat(
	loadedStory: BenchmarkLoadedStory,
	repeatIndex: number,
	pipelineOnly: boolean,
): Promise<BenchmarkRepeatResult> {
	const startedAt = new Date().toISOString();
	const pipeline = await runPipelineEval(loadedStory, repeatIndex);
	const isolated = pipelineOnly
		? null
		: await runIsolatedStages(loadedStory, repeatIndex);

	return {
		durationMs:
			pipeline.durationMs +
			(isolated
				? Object.values(isolated.runs).reduce(
						(sum, run) => sum + run.durationMs,
						0,
					)
				: 0),
		isolated,
		pipeline,
		repeatIndex,
		startedAt,
	};
}
