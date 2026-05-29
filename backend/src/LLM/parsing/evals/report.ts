import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BenchmarkCompletedRun, BenchmarkRepeatResult } from './types.js';
import { recordsToNdjson, rowsToCsv } from './utils.js';

function formatNumber(value: unknown) {
	return typeof value === 'number' ? value.toLocaleString() : '—';
}

function topMetricLines(
	metrics: Array<{ label: string; value: unknown }>,
): string {
	return metrics
		.map((metric) => `- ${metric.label}: ${formatNumber(metric.value)}`)
		.join('\n');
}

function buildSummaryMarkdown(run: BenchmarkCompletedRun): string {
	const input = run.metrics.families.input as Record<string, unknown>;
	const llm = run.metrics.families.llm as Record<string, unknown>;
	const quality = run.metrics.families.quality as Record<string, unknown>;
	const baseline = run.metrics.families.baselineComparison as Record<
		string,
		unknown
	> | null;

	const topFindings = run.findings.slice(0, 8);
	const stageRows = run.metrics.stageMetricRows
		.slice()
		.sort((left, right) =>
			String(left.stageLabel).localeCompare(String(right.stageLabel)),
		)
		.map(
			(row) =>
				`| ${row.runType} | ${row.stageLabel} | ${formatNumber(
					row.durationMs,
				)} | ${formatNumber(row.llmRequestCount)} | ${formatNumber(
					row.selectedChunkCount,
				)} | ${formatNumber(row.warningCount)} |`,
		)
		.join('\n');

	const artifactLines = [
		'report.json',
		'summary.md',
		'stage-metrics.csv',
		'entity-routing.csv',
		'llm-calls.csv',
		'chunk-index.csv',
		...(run.repeats.length === 1
			? [
					'pipeline-output.json',
					'isolated-stage-outputs.json',
					'parsing-index.json',
					'trace.ndjson',
					'verbose.ndjson',
				]
			: ['repeats/run-01/...']),
	].map((name) => `- ${name}`);

	return [
		'# Parser Benchmark Summary',
		'',
		'## Story',
		`- id: ${run.loadedStory.manifest.id}`,
		`- title: ${run.loadedStory.manifest.title}`,
		`- fixture: ${run.loadedStory.manifest.fixturePath}`,
		`- repeats: ${run.repeats.length}`,
		'',
		'## Snapshot',
		topMetricLines([
			{ label: 'Source chars', value: input.sourceChars },
			{ label: 'Chunk count', value: input.chunkCount },
			{
				label: 'Pipeline duration (ms)',
				value: run.metrics.qualitySnapshot.pipelineDurationMs,
			},
			{ label: 'Average LLM calls', value: llm.averageCalls },
			{
				label: 'Character recall',
				value: run.metrics.qualitySnapshot.characterRecall,
			},
			{
				label: 'Location recall',
				value: run.metrics.qualitySnapshot.locationRecall,
			},
			{
				label: 'Identity-link recall',
				value: run.metrics.qualitySnapshot.identityLinkRecall,
			},
			{
				label: 'Key-memory coverage',
				value: run.metrics.qualitySnapshot.keyMemoryCoverage,
			},
		]),
		'',
		'## Baseline',
		baseline?.baselineAvailable
			? topMetricLines([
					{
						label: 'Fixture hash matches baseline',
						value:
							baseline.fixtureHashMatches === true ? 'yes' : 'no',
					},
					{
						label: 'Compared metrics',
						value: Array.isArray(baseline.changedMetrics)
							? baseline.changedMetrics.length
							: 0,
					},
				])
			: '- No blessed baseline available',
		'',
		'## Top Findings',
		topFindings.length > 0
			? topFindings
					.map(
						(finding) =>
							`- [${finding.severity}] ${finding.title}: ${finding.detail}`,
					)
					.join('\n')
			: '- No findings',
		'',
		'## Stage Breakdown',
		'| run | stage | duration ms | llm requests | selected chunks | warnings |',
		'| --- | --- | ---: | ---: | ---: | ---: |',
		stageRows,
		'',
		'## Artifacts',
		artifactLines.join('\n'),
		'',
		'## Quality Summary',
		'```json',
		JSON.stringify(quality, null, 2),
		'```',
		'',
	].join('\n');
}

function buildTraceRowsForRepeat(repeat: BenchmarkRepeatResult) {
	const pipelineEvents = repeat.pipeline.trace.events.map((event) => ({
		...event,
		repeatIndex: repeat.repeatIndex,
		runType: 'pipeline',
	}));
	const isolatedEvents = repeat.isolated
		? Object.entries(repeat.isolated.runs).flatMap(([stageLabel, run]) =>
				run.trace.events.map((event) => ({
					...event,
					repeatIndex: repeat.repeatIndex,
					runType: 'isolated',
					stageLabel,
				})),
			)
		: [];
	return [...pipelineEvents, ...isolatedEvents];
}

function buildVerboseRowsForRepeat(repeat: BenchmarkRepeatResult) {
	const pipelineRows = repeat.pipeline.verbose;
	const isolatedRows = repeat.isolated
		? Object.values(repeat.isolated.runs).flatMap((run) => run.verbose)
		: [];
	return [...pipelineRows, ...isolatedRows];
}

async function writeRepeatArtifacts(
	baseDir: string,
	repeat: BenchmarkRepeatResult,
) {
	await mkdir(baseDir, { recursive: true });
	await writeFile(
		join(baseDir, 'pipeline-output.json'),
		JSON.stringify(repeat.pipeline.output, null, 2),
		'utf8',
	);
	if (repeat.isolated) {
		await writeFile(
			join(baseDir, 'isolated-stage-outputs.json'),
			JSON.stringify(repeat.isolated.outputs, null, 2),
			'utf8',
		);
		await writeFile(
			join(baseDir, 'parsing-index.json'),
			JSON.stringify(repeat.isolated.outputs.index, null, 2),
			'utf8',
		);
	}
	await writeFile(
		join(baseDir, 'trace.ndjson'),
		recordsToNdjson(buildTraceRowsForRepeat(repeat)),
		'utf8',
	);
	await writeFile(
		join(baseDir, 'verbose.ndjson'),
		recordsToNdjson(buildVerboseRowsForRepeat(repeat)),
		'utf8',
	);
}

export async function writeRunArtifacts(run: BenchmarkCompletedRun) {
	await mkdir(run.storyOutDir, { recursive: true });
	await writeFile(
		join(run.storyOutDir, 'report.json'),
		JSON.stringify(
			{
				findings: run.findings,
				loadedStory: {
					context: run.loadedStory.context ?? null,
					fixtureHash: run.loadedStory.fixtureHash,
					manifest: run.loadedStory.manifest,
				},
				metrics: run.metrics,
			},
			null,
			2,
		),
		'utf8',
	);
	await writeFile(
		join(run.storyOutDir, 'summary.md'),
		buildSummaryMarkdown(run),
		'utf8',
	);
	await writeFile(
		join(run.storyOutDir, 'stage-metrics.csv'),
		rowsToCsv(run.metrics.stageMetricRows),
		'utf8',
	);
	await writeFile(
		join(run.storyOutDir, 'entity-routing.csv'),
		rowsToCsv(run.metrics.entityRoutingRows),
		'utf8',
	);
	await writeFile(
		join(run.storyOutDir, 'llm-calls.csv'),
		rowsToCsv(run.metrics.llmCallRows),
		'utf8',
	);
	await writeFile(
		join(run.storyOutDir, 'chunk-index.csv'),
		rowsToCsv(run.metrics.chunkIndexRows),
		'utf8',
	);
	await writeFile(
		join(run.storyOutDir, 'trace.ndjson'),
		recordsToNdjson(
			run.repeats.flatMap((repeat) => buildTraceRowsForRepeat(repeat)),
		),
		'utf8',
	);
	await writeFile(
		join(run.storyOutDir, 'verbose.ndjson'),
		recordsToNdjson(
			run.repeats.flatMap((repeat) => buildVerboseRowsForRepeat(repeat)),
		),
		'utf8',
	);

	if (run.repeats.length === 1) {
		await writeRepeatArtifacts(run.storyOutDir, run.repeats[0]);
		return;
	}

	const repeatsDir = join(run.storyOutDir, 'repeats');
	for (const repeat of run.repeats) {
		await writeRepeatArtifacts(
			join(
				repeatsDir,
				`run-${String(repeat.repeatIndex).padStart(2, '0')}`,
			),
			repeat,
		);
	}
}

export async function writeSuiteArtifacts(
	outputRootDir: string,
	runs: BenchmarkCompletedRun[],
) {
	const suiteRows = runs.map((run) => ({
		characterCount: run.metrics.qualitySnapshot.characterCount,
		characterRecall: run.metrics.qualitySnapshot.characterRecall,
		findings: run.findings.length,
		locationCount: run.metrics.qualitySnapshot.locationCount,
		locationRecall: run.metrics.qualitySnapshot.locationRecall,
		memoryCount: run.metrics.qualitySnapshot.memoryCount,
		pipelineDurationMs: run.metrics.qualitySnapshot.pipelineDurationMs,
		storyId: run.loadedStory.manifest.id,
		title: run.loadedStory.manifest.title,
		totalLlmCalls: run.metrics.qualitySnapshot.totalLlmCalls,
	}));

	await writeFile(
		join(outputRootDir, 'suite-summary.json'),
		JSON.stringify(
			runs.map((run) => ({
				findings: run.findings,
				metrics: run.metrics.qualitySnapshot,
				storyId: run.loadedStory.manifest.id,
				storyOutDir: run.storyOutDir,
			})),
			null,
			2,
		),
		'utf8',
	);
	await writeFile(
		join(outputRootDir, 'suite-quality.csv'),
		rowsToCsv(suiteRows),
		'utf8',
	);
	await writeFile(
		join(outputRootDir, 'suite-stage-metrics.csv'),
		rowsToCsv(
			runs.flatMap((run) =>
				run.metrics.stageMetricRows.map((row) => ({
					...row,
					storyId: run.loadedStory.manifest.id,
				})),
			),
		),
		'utf8',
	);
	await writeFile(
		join(outputRootDir, 'suite-findings.csv'),
		rowsToCsv(
			runs.flatMap((run) =>
				run.findings.map((finding) => ({
					detail: finding.detail,
					severity: finding.severity,
					stage: finding.stage ?? '',
					storyId: run.loadedStory.manifest.id,
					title: finding.title,
				})),
			),
		),
		'utf8',
	);
}
