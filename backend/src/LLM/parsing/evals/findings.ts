import type {
	BenchmarkFinding,
	BenchmarkMetricRegistryOutput,
} from './types.js';

function numeric(row: Record<string, unknown>, key: string): number {
	const value = row[key];
	return typeof value === 'number' ? value : 0;
}

export function buildFindings(
	metrics: BenchmarkMetricRegistryOutput,
): BenchmarkFinding[] {
	const findings: BenchmarkFinding[] = [];
	const stageRows = metrics.stageMetricRows;
	const quality = metrics.families.quality as Record<string, unknown>;
	const llm = metrics.families.llm as Record<string, unknown>;
	const routing = metrics.families.routing as
		| { perStage?: Array<Record<string, unknown>> }
		| undefined;
	const baseline = metrics.families.baselineComparison as {
		changedMetrics?: Array<Record<string, unknown>>;
	} | null;

	for (const row of stageRows) {
		const stageLabel = String(row.stageLabel ?? '');
		if (
			stageLabel === 'story.core' &&
			numeric(row, 'selectedChunkCount') > 8
		) {
			findings.push({
				code: 'core_chunk_bound_exceeded',
				detail: `story.core selected ${numeric(row, 'selectedChunkCount')} chunks.`,
				severity: 'warning',
				stage: 'story.core',
				title: 'Core chunk bound exceeded',
			});
		}
		if (numeric(row, 'warningCount') >= 3) {
			findings.push({
				code: 'high_warning_rate',
				detail: `${stageLabel} emitted ${numeric(row, 'warningCount')} warnings.`,
				severity: 'warning',
				stage: stageLabel,
				title: 'High warning rate',
			});
		}
		if (numeric(row, 'llmRetryCount') >= 2) {
			findings.push({
				code: 'high_retry_rate',
				detail: `${stageLabel} retried ${numeric(row, 'llmRetryCount')} LLM calls.`,
				severity: 'warning',
				stage: stageLabel,
				title: 'High retry rate',
			});
		}
	}

	for (const row of routing?.perStage ?? []) {
		if (
			row.stage === 'story.characters' &&
			row.fullScanGuardrailTriggered === true
		) {
			findings.push({
				code: 'character_routing_too_broad',
				detail: `Average character routing touched ${numeric(row, 'avgChunkCountPerEntity')} chunks.`,
				severity: 'warning',
				stage: 'story.characters',
				title: 'Character routing too broad',
			});
		}
		if (
			row.stage === 'story.relationships' &&
			row.fullScanGuardrailTriggered === true
		) {
			findings.push({
				code: 'relationship_routing_too_broad',
				detail: `Average relationship routing touched ${numeric(row, 'avgChunkCountPerEntity')} chunks.`,
				severity: 'warning',
				stage: 'story.relationships',
				title: 'Relationship routing too broad',
			});
		}
	}

	const locationSummary = quality.locationSummary as
		| { duplicateWarningCount?: number }
		| undefined;
	if ((locationSummary?.duplicateWarningCount ?? 0) > 0) {
		findings.push({
			code: 'duplicate_location_risk',
			detail: `Detected ${locationSummary?.duplicateWarningCount ?? 0} possible duplicate location pairs.`,
			severity: 'warning',
			stage: 'story.locations',
			title: 'Duplicate location risk',
		});
	}

	const memorySummary = quality.memorySummary as
		| { memoriesWithDeltasRate?: number }
		| undefined;
	if ((memorySummary?.memoriesWithDeltasRate ?? 1) < 0.4) {
		findings.push({
			code: 'low_memory_delta_coverage',
			detail: `Only ${((memorySummary?.memoriesWithDeltasRate ?? 0) * 100).toFixed(1)}% of memories carried deltas.`,
			severity: 'warning',
			stage: 'story.memories',
			title: 'Low memory delta coverage',
		});
	}

	const characterGroundTruth = quality.characterGroundTruth as
		| { recall?: number; missing?: string[] }
		| undefined;
	if ((characterGroundTruth?.recall ?? 1) < 0.7) {
		findings.push({
			code: 'low_character_recall',
			detail: `Character recall was ${characterGroundTruth?.recall ?? 0}. Missing: ${characterGroundTruth?.missing?.join(', ') || '(none)'}.`,
			severity: 'warning',
			stage: 'story.characters',
			title: 'Low character recall',
		});
	}

	const locationGroundTruth = quality.locationGroundTruth as
		| { recall?: number; missing?: string[] }
		| undefined;
	if ((locationGroundTruth?.recall ?? 1) < 0.7) {
		findings.push({
			code: 'low_location_recall',
			detail: `Location recall was ${locationGroundTruth?.recall ?? 0}. Missing: ${locationGroundTruth?.missing?.join(', ') || '(none)'}.`,
			severity: 'warning',
			stage: 'story.locations',
			title: 'Low location recall',
		});
	}

	for (const delta of baseline?.changedMetrics ?? []) {
		if (
			(delta.metric === 'pipelineDurationMs' ||
				delta.metric === 'totalLlmCalls') &&
			numeric(delta, 'delta') > 0
		) {
			findings.push({
				code: 'baseline_efficiency_regression',
				detail: `${String(delta.metric)} regressed by ${numeric(delta, 'delta')}.`,
				severity: 'info',
				stage: null,
				title: 'Efficiency regressed against baseline',
			});
		}
	}

	const averageCalls = numeric(llm, 'averageCalls');
	if (averageCalls > 0 && averageCalls >= 80) {
		findings.push({
			code: 'high_total_llm_calls',
			detail: `Average LLM calls per run reached ${averageCalls}.`,
			severity: 'info',
			stage: null,
			title: 'High total LLM call count',
		});
	}

	return findings;
}
