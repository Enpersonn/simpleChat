import { useState } from 'preact/hooks';
import type {
	ContextAssemblyData,
	ContextSnapshot,
	DataLoadData,
	ExtractionData,
	LlmCallData,
	MemoryChainData,
	MemoryRetrievalData,
	PersistResultData,
	PipelineEvent,
	PipelineStep,
} from '../../lib/debug-types.js';

const STEP_ORDER: PipelineStep[] = [
	'data_load',
	'memory_chain',
	'memory_retrieval',
	'context_assembly',
	'llm_call',
	'persist_result',
	'extraction',
];

const STEP_LABELS: Record<PipelineStep, string> = {
	context_assembly: 'Context Assembly',
	data_load: 'Data Load',
	extraction: 'Extraction',
	llm_call: 'LLM Call',
	memory_chain: 'Memory Chain',
	memory_retrieval: 'Memory Retrieval',
	persist_result: 'Persist Result',
};

interface Props {
	events: PipelineEvent[];
	snapshot: ContextSnapshot | null;
}

export function FlowTimeline({ events, snapshot }: Props) {
	const [expanded, setExpanded] = useState<Set<PipelineStep>>(new Set());

	if (events.length === 0) {
		return (
			<div class="py-4 text-center text-[11px] text-text-muted">
				Send a message to see the pipeline flow
			</div>
		);
	}

	const byStep = new Map<
		PipelineStep,
		{ start?: PipelineEvent; terminal?: PipelineEvent }
	>();
	for (const e of events) {
		const entry = byStep.get(e.step) ?? {};
		if (e.status === 'start') entry.start = e;
		else entry.terminal = e;
		byStep.set(e.step, entry);
	}

	const toggle = (step: PipelineStep) => {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(step)) next.delete(step);
			else next.add(step);
			return next;
		});
	};

	return (
		<div class="flex flex-col gap-0.5">
			{STEP_ORDER.map((step) => {
				const entry = byStep.get(step);
				if (!entry) return null;
				const { start, terminal } = entry;
				const isOpen = expanded.has(step);
				const status = terminal
					? terminal.status
					: start
						? 'running'
						: 'pending';
				const hasData = terminal?.data !== undefined;
				const canExpand = terminal?.status === 'complete' && hasData;

				return (
					<div key={step} class="overflow-hidden rounded">
						<div
							class={`flex select-none items-center gap-1.5 border border-border bg-bg-secondary px-1.5 py-[5px] hover:bg-bg-hover ${isOpen ? 'rounded-t border-b-transparent' : 'rounded'}`}
							data-open={isOpen ? 'true' : undefined}
							onClick={() => canExpand && toggle(step)}
							style={{
								cursor: canExpand ? 'pointer' : 'default',
							}}
						>
							{/* Status dot */}
							{status === 'complete' && (
								<span class="h-2 w-2 shrink-0 rounded-full bg-success" />
							)}
							{status === 'error' && (
								<span class="h-2 w-2 shrink-0 rounded-full bg-error" />
							)}
							{status === 'running' && (
								<span class="h-2 w-2 shrink-0 animate-pulse-dot rounded-full bg-accent" />
							)}
							{status === 'pending' && (
								<span class="h-2 w-2 shrink-0 rounded-full bg-border" />
							)}
							<span class="flex-1 font-medium text-[11px] text-text-primary">
								{STEP_LABELS[step]}
							</span>
							{terminal?.durationMs !== undefined && (
								<span class="text-sm text-text-muted tabular-nums">
									{terminal.durationMs}ms
								</span>
							)}
							{canExpand && (
								<span
									class={`shrink-0 text-sm text-text-muted transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
								>
									▾
								</span>
							)}
						</div>
						{isOpen && terminal?.data && (
							<div class="rounded-b border border-border border-t-0 bg-bg-tertiary px-2 py-2 text-sm text-text-secondary leading-[1.5]">
								<StepData
									step={step}
									data={terminal.data}
									snapshot={snapshot}
								/>
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}

function StepData({
	step,
	data,
	snapshot,
}: {
	step: PipelineStep;
	data: object;
	snapshot: ContextSnapshot | null;
}) {
	if (step === 'data_load') {
		const d = data as DataLoadData;
		return (
			<div class="flex gap-3">
				<div class="flex flex-col items-center">
					<span class="font-semibold text-[14px] text-text-primary">
						{d.characterCount}
					</span>
					<span class="text-[9px] text-text-muted uppercase tracking-[0.04em]">
						Chars
					</span>
				</div>
				<div class="flex flex-col items-center">
					<span class="font-semibold text-[14px] text-text-primary">
						{d.locationCount}
					</span>
					<span class="text-[9px] text-text-muted uppercase tracking-[0.04em]">
						Locations
					</span>
				</div>
				<div class="flex flex-col items-center">
					<span class="font-semibold text-[14px] text-text-primary">
						{d.turnCount}
					</span>
					<span class="text-[9px] text-text-muted uppercase tracking-[0.04em]">
						Turns
					</span>
				</div>
			</div>
		);
	}

	if (step === 'memory_chain') {
		const d = data as MemoryChainData;
		if (d.chains.length === 0)
			return <span class="text-text-muted italic">No characters</span>;
		return (
			<table class="w-full border-collapse">
				<tbody>
					{d.chains.map((c) => {
						const diff = c.effectiveDiff;
						const hasDiff =
							diff.personalityAdded.length > 0 ||
							diff.personalityRemoved.length > 0 ||
							diff.fearsAdded.length > 0 ||
							diff.speechStyleChanged ||
							diff.trueMotivestChanged ||
							diff.hiddenEmotionalStateChanged;
						const diffParts: string[] = [];
						if (diff.personalityAdded.length > 0)
							diffParts.push(
								`+${diff.personalityAdded.slice(0, 2).join(', ')}`,
							);
						if (diff.personalityRemoved.length > 0)
							diffParts.push(
								`−${diff.personalityRemoved.slice(0, 2).join(', ')}`,
							);
						if (diff.fearsAdded.length > 0)
							diffParts.push(`fear+${diff.fearsAdded[0]}`);
						if (diff.speechStyleChanged) diffParts.push('speech ✓');
						if (diff.trueMotivestChanged)
							diffParts.push('motives ✓');
						if (diff.hiddenEmotionalStateChanged)
							diffParts.push('emotion ✓');

						return (
							<tr key={c.characterId}>
								<td class="whitespace-nowrap px-1 py-0.5 align-top font-medium text-text-primary">
									{c.characterName}
								</td>
								<td class="whitespace-nowrap px-1 py-0.5 align-top text-text-muted">
									{c.chainLength} mem
								</td>
								<td class="px-1 py-0.5 align-top text-[9px] text-text-secondary">
									{hasDiff ? (
										diffParts.map((p, i) => (
											<span
												key={i}
												class={
													p.startsWith('+')
														? 'text-success'
														: p.startsWith('−')
															? 'text-error'
															: 'text-warning'
												}
											>
												{p}
												{i < diffParts.length - 1
													? ' · '
													: ''}
											</span>
										))
									) : (
										<span class="text-text-muted">
											no delta
										</span>
									)}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		);
	}

	if (step === 'memory_retrieval') {
		const d = data as MemoryRetrievalData;
		const memMap = new Map(
			snapshot?.accessibleMemories.map((m) => [m.id, m.summary]) ?? [],
		);
		return (
			<div>
				<div class="mb-1 text-[9px] text-text-muted">
					{d.results.length} of {d.accessibleCount} accessible
					memories injected
				</div>
				{d.results.length === 0 ? (
					<span class="text-text-muted italic">
						No memories retrieved
					</span>
				) : (
					<div class="mt-1 flex flex-wrap gap-1">
						{d.results.map((r) => {
							const summary = memMap.get(r.memoryId) ?? r.summary;
							const reasonLabel =
								r.reason === 'always_include'
									? 'Always'
									: r.reason === 'semantic'
										? `Semantic (${r.score ? r.score.toFixed(2) : '~'})`
										: r.reason === 'tag_match'
											? `Tag (${r.score ?? 1})`
											: 'LLM picked';
							// color-mix() backgrounds kept as inline styles
							const pillStyle =
								r.reason === 'always_include'
									? {
											background:
												'color-mix(in srgb, var(--accent) 20%, transparent)',
											border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
										}
									: r.reason === 'semantic'
										? {
												background:
													'color-mix(in srgb, #60a5fa 15%, transparent)',
												border: '1px solid color-mix(in srgb, #60a5fa 35%, transparent)',
											}
										: r.reason === 'tag_match'
											? {
													background:
														'color-mix(in srgb, #4ade80 15%, transparent)',
													border: '1px solid color-mix(in srgb, #4ade80 35%, transparent)',
												}
											: {
													background:
														'color-mix(in srgb, #fbbf24 15%, transparent)',
													border: '1px solid color-mix(in srgb, #fbbf24 35%, transparent)',
												};
							return (
								<div
									key={r.memoryId}
									class="flex max-w-[160px] flex-col gap-0.5 rounded-[3px] px-1.5 py-[3px] text-[9px]"
									style={pillStyle}
									title={summary}
								>
									<span class="overflow-hidden text-ellipsis whitespace-nowrap font-medium text-text-primary">
										{summary.slice(0, 40)}
										{summary.length > 40 ? '…' : ''}
									</span>
									<span class="text-[8px] text-text-muted">
										{reasonLabel}
									</span>
								</div>
							);
						})}
					</div>
				)}
				{d.llmFallbackFired && (
					<div
						class="mt-1.5 rounded-[3px] px-1.5 py-[3px] text-[9px] text-warning"
						style={{
							background:
								'color-mix(in srgb, #fbbf24 15%, transparent)',
							border: '1px solid color-mix(in srgb, #fbbf24 30%, transparent)',
						}}
					>
						LLM fallback fired
					</div>
				)}
			</div>
		);
	}

	if (step === 'context_assembly') {
		const d = data as ContextAssemblyData;
		const locLabel = d.currentLocationId ? 'Active' : 'None';
		return (
			<div class="flex flex-col gap-[3px]">
				<div class="flex justify-between gap-2">
					<span class="text-text-muted">Prompt length</span>
					<span class="text-right font-medium text-text-primary">
						{d.systemPromptLength.toLocaleString()} chars
					</span>
				</div>
				<div class="flex justify-between gap-2">
					<span class="text-text-muted">Memories injected</span>
					<span class="text-right font-medium text-text-primary">
						{d.injectedMemoryIds.length}
					</span>
				</div>
				<div class="flex justify-between gap-2">
					<span class="text-text-muted">Location</span>
					<span class="text-right font-medium text-text-primary">
						{locLabel}
					</span>
				</div>
				<div class="flex justify-between gap-2">
					<span class="text-text-muted">Mood tags</span>
					<span class="text-right font-medium text-text-primary">
						{d.moodTagCount}
					</span>
				</div>
			</div>
		);
	}

	if (step === 'llm_call') {
		const d = data as LlmCallData;
		return (
			<div class="flex flex-col gap-[3px]">
				<div class="flex justify-between gap-2">
					<span class="text-text-muted">Model</span>
					<span class="text-right font-medium text-text-primary">
						{d.model}
					</span>
				</div>
				<div class="flex justify-between gap-2">
					<span class="text-text-muted">~Tokens out</span>
					<span class="text-right font-medium text-text-primary">
						{d.tokenCount.toLocaleString()}
					</span>
				</div>
				{d.agentSteps !== undefined && (
					<div class="flex justify-between gap-2">
						<span class="text-text-muted">Agent steps</span>
						<span class="text-right font-medium text-text-primary">
							{d.agentSteps}
						</span>
					</div>
				)}
				<div class="flex justify-between gap-2">
					<span class="text-text-muted">Duration</span>
					<span class="text-right font-medium text-text-primary">
						{d.durationMs.toLocaleString()}ms
					</span>
				</div>
			</div>
		);
	}

	if (step === 'persist_result') {
		return (
			<span class="text-[9px] text-text-muted italic">
				{(data as PersistResultData).turnId
					? `Turn ${(data as PersistResultData).turnId}`
					: 'Turn saved'}
			</span>
		);
	}

	if (step === 'extraction') {
		const d = data as ExtractionData;
		return (
			<div class="flex flex-col gap-[3px]">
				<div class="flex justify-between gap-2">
					<span class="text-text-muted">Location changed</span>
					<span
						class={`inline-block rounded-[3px] px-[5px] py-[1px] font-medium text-[9px] ${d.locationChanged ? 'text-success' : 'bg-bg-hover text-text-muted'}`}
						style={
							d.locationChanged
								? {
										background:
											'color-mix(in srgb, #4ade80 15%, transparent)',
									}
								: undefined
						}
					>
						{d.locationChanged ? 'Yes' : 'No'}
					</span>
				</div>
				{d.newLocationCreated && (
					<div class="flex justify-between gap-2">
						<span class="text-text-muted">New location</span>
						<span class="text-right font-medium text-text-primary">
							{d.newLocationName ?? '?'}
						</span>
					</div>
				)}
				<div class="flex justify-between gap-2">
					<span class="text-text-muted">Overrides changed</span>
					<span
						class={`inline-block rounded-[3px] px-[5px] py-[1px] font-medium text-[9px] ${d.overridesChanged ? 'text-success' : 'bg-bg-hover text-text-muted'}`}
						style={
							d.overridesChanged
								? {
										background:
											'color-mix(in srgb, #4ade80 15%, transparent)',
									}
								: undefined
						}
					>
						{d.overridesChanged ? 'Yes' : 'No'}
					</span>
				</div>
				{(d.locationChanged || d.newLocationCreated) &&
					d.newLocationId && (
						<div class="flex justify-between gap-2">
							<span class="text-text-muted">New location ID</span>
							<span class="text-right font-medium text-[9px] text-text-primary">
								{d.newLocationId}
							</span>
						</div>
					)}
				{d.narrativePressure !== undefined && (
					<div class="flex justify-between gap-2">
						<span class="text-text-muted">Narrative pressure</span>
						<span class="text-right font-medium text-text-primary">
							{d.narrativePressure}/100
						</span>
					</div>
				)}
				{d.canonFactsCreated !== undefined && d.canonFactsCreated > 0 && (
					<div class="flex justify-between gap-2">
						<span class="text-text-muted">Canon facts</span>
						<span class="text-right font-medium text-success">
							+{d.canonFactsCreated}
						</span>
					</div>
				)}
				{d.relationshipUpdates !== undefined &&
					d.relationshipUpdates > 0 && (
						<div class="flex justify-between gap-2">
							<span class="text-text-muted">Relationship updates</span>
							<span class="text-right font-medium text-text-primary">
								{d.relationshipUpdates}
							</span>
						</div>
					)}
				{d.volatileUpdates !== undefined && d.volatileUpdates > 0 && (
					<div class="flex justify-between gap-2">
						<span class="text-text-muted">Volatile state updates</span>
						<span class="text-right font-medium text-text-primary">
							{d.volatileUpdates}
						</span>
					</div>
				)}
			</div>
		);
	}

	return null;
}
