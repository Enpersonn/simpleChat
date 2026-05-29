import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
	type BaselineSnapshot,
	BaselineSnapshotSchema,
	type BenchmarkLoadedStory,
	type BenchmarkMetricRow,
	type BenchmarkSummarySnapshot,
} from './types.js';
import { fileExists } from './utils.js';

export async function loadBaseline(
	path: string,
): Promise<BaselineSnapshot | null> {
	if (!path || !(await fileExists(path))) return null;
	const raw = await readFile(path, 'utf8');
	return BaselineSnapshotSchema.parse(JSON.parse(raw));
}

function pickNumeric(row: BenchmarkMetricRow | undefined, key: string): number {
	const value = row?.[key];
	return typeof value === 'number' ? value : 0;
}

function findStageMetric(
	rows: BenchmarkMetricRow[],
	stageLabel: string,
	runType: 'isolated' | 'pipeline',
) {
	return rows.find(
		(row) => row.stageLabel === stageLabel && row.runType === runType,
	);
}

function aggregateStageRows(rows: BenchmarkMetricRow[]): BenchmarkMetricRow[] {
	const groups = new Map<string, BenchmarkMetricRow[]>();
	for (const row of rows) {
		if (
			typeof row.stageLabel !== 'string' ||
			(row.runType !== 'pipeline' && row.runType !== 'isolated')
		) {
			continue;
		}
		const key = `${row.runType}:${row.stageLabel}`;
		const existing = groups.get(key) ?? [];
		existing.push(row);
		groups.set(key, existing);
	}

	return [...groups.entries()].map(([key, group]) => {
		const [runType, stageLabel] = key.split(':');
		const averageOf = (metric: string) =>
			group.reduce((sum, row) => sum + pickNumeric(row, metric), 0) /
			group.length;
		return {
			avgSelectedChunksPerEntity: Number(
				averageOf('avgSelectedChunksPerEntity').toFixed(4),
			),
			durationMs: Number(averageOf('durationMs').toFixed(4)),
			llmRequestCount: Number(averageOf('llmRequestCount').toFixed(4)),
			llmTotalTokens: Number(averageOf('llmTotalTokens').toFixed(4)),
			runType,
			selectedChunkCount: Number(
				averageOf('selectedChunkCount').toFixed(4),
			),
			stageLabel,
			warningCount: Number(averageOf('warningCount').toFixed(4)),
		};
	});
}

export function createBaselineSnapshot(
	loadedStory: BenchmarkLoadedStory,
	quality: BenchmarkSummarySnapshot,
	stageMetricRows: BenchmarkMetricRow[],
): BaselineSnapshot {
	const stageRows = aggregateStageRows(stageMetricRows)
		.filter(
			(row) =>
				typeof row.stageLabel === 'string' &&
				(row.runType === 'pipeline' || row.runType === 'isolated'),
		)
		.map((row) => ({
			avgSelectedChunksPerEntity: pickNumeric(
				row,
				'avgSelectedChunksPerEntity',
			),
			durationMs: pickNumeric(row, 'durationMs'),
			llmRequestCount: pickNumeric(row, 'llmRequestCount'),
			llmTotalTokens: pickNumeric(row, 'llmTotalTokens'),
			runType: row.runType as 'isolated' | 'pipeline',
			selectedChunkCount: pickNumeric(row, 'selectedChunkCount'),
			stageLabel: String(row.stageLabel),
			warningCount: pickNumeric(row, 'warningCount'),
		}));

	const summary: BenchmarkSummarySnapshot = {
		characterCount: quality.characterCount,
		characterRecall: quality.characterRecall,
		duplicateLocationWarnings: quality.duplicateLocationWarnings,
		identityLinkRecall: quality.identityLinkRecall,
		keyMemoryCoverage: quality.keyMemoryCoverage,
		locationCount: quality.locationCount,
		locationRecall: quality.locationRecall,
		memoriesWithDeltasRate: quality.memoriesWithDeltasRate,
		memoryCount: quality.memoryCount,
		pipelineDurationMs: quality.pipelineDurationMs,
		totalLlmCalls: quality.totalLlmCalls,
	};

	return BaselineSnapshotSchema.parse({
		blessedAt: new Date().toISOString(),
		fixtureHash: loadedStory.fixtureHash,
		parserVersion: 1,
		stageMetrics: stageRows,
		storyId: loadedStory.manifest.id,
		summary,
	});
}

export function compareToBaseline(
	loadedStory: BenchmarkLoadedStory,
	qualitySnapshot: BenchmarkSummarySnapshot,
	stageMetricRows: BenchmarkMetricRow[],
	baseline: BaselineSnapshot | null,
) {
	if (!baseline) {
		return {
			baselineAvailable: false,
			changedMetrics: [],
			fixtureHashMatches: false,
			stageDeltas: [],
		};
	}

	const current = qualitySnapshot;
	const summaryPairs = [
		[
			'pipelineDurationMs',
			current.pipelineDurationMs,
			baseline.summary.pipelineDurationMs,
		],
		[
			'totalLlmCalls',
			current.totalLlmCalls,
			baseline.summary.totalLlmCalls,
		],
		[
			'characterCount',
			current.characterCount,
			baseline.summary.characterCount,
		],
		[
			'locationCount',
			current.locationCount,
			baseline.summary.locationCount,
		],
		['memoryCount', current.memoryCount, baseline.summary.memoryCount],
		[
			'characterRecall',
			current.characterRecall,
			baseline.summary.characterRecall,
		],
		[
			'locationRecall',
			current.locationRecall,
			baseline.summary.locationRecall,
		],
		[
			'identityLinkRecall',
			current.identityLinkRecall,
			baseline.summary.identityLinkRecall,
		],
		[
			'keyMemoryCoverage',
			current.keyMemoryCoverage,
			baseline.summary.keyMemoryCoverage,
		],
		[
			'duplicateLocationWarnings',
			current.duplicateLocationWarnings,
			baseline.summary.duplicateLocationWarnings,
		],
		[
			'memoriesWithDeltasRate',
			current.memoriesWithDeltasRate,
			baseline.summary.memoriesWithDeltasRate,
		],
	] as const;

	const changedMetrics = summaryPairs.map(
		([key, currentValue, baselineValue]) => ({
			baselineValue,
			currentValue,
			delta:
				typeof currentValue === 'number' &&
				typeof baselineValue === 'number'
					? Number((currentValue - baselineValue).toFixed(4))
					: null,
			metric: key,
		}),
	);

	const aggregatedStageRows = aggregateStageRows(stageMetricRows);
	const stageDeltas = baseline.stageMetrics.map((baselineStage) => {
		const currentStage = findStageMetric(
			aggregatedStageRows,
			baselineStage.stageLabel,
			baselineStage.runType,
		);
		return {
			avgSelectedChunksPerEntityDelta:
				pickNumeric(currentStage, 'avgSelectedChunksPerEntity') -
				baselineStage.avgSelectedChunksPerEntity,
			durationMsDelta:
				pickNumeric(currentStage, 'durationMs') -
				baselineStage.durationMs,
			llmRequestCountDelta:
				pickNumeric(currentStage, 'llmRequestCount') -
				baselineStage.llmRequestCount,
			llmTotalTokensDelta:
				pickNumeric(currentStage, 'llmTotalTokens') -
				baselineStage.llmTotalTokens,
			runType: baselineStage.runType,
			selectedChunkCountDelta:
				pickNumeric(currentStage, 'selectedChunkCount') -
				baselineStage.selectedChunkCount,
			stageLabel: baselineStage.stageLabel,
			warningCountDelta:
				pickNumeric(currentStage, 'warningCount') -
				baselineStage.warningCount,
		};
	});

	return {
		baselineAvailable: true,
		changedMetrics,
		fixtureHashMatches: baseline.fixtureHash === loadedStory.fixtureHash,
		stageDeltas,
	};
}

export async function blessBaseline(
	loadedStory: BenchmarkLoadedStory,
	qualitySnapshot: BenchmarkSummarySnapshot,
	stageMetricRows: BenchmarkMetricRow[],
): Promise<void> {
	const path = loadedStory.manifest.baselinePath;
	if (!path) {
		throw new Error(
			`Cannot bless baseline for ad hoc story "${loadedStory.manifest.id}"`,
		);
	}
	await mkdir(dirname(path), { recursive: true });
	await writeFile(
		path,
		JSON.stringify(
			createBaselineSnapshot(
				loadedStory,
				qualitySnapshot,
				stageMetricRows,
			),
			null,
			2,
		),
		'utf8',
	);
}
