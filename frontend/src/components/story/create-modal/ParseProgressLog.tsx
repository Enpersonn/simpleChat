import { useState } from 'preact/hooks';
import type { ParseVerboseEvent } from '@/src/lib/stream';

export type StageStatus = 'pending' | 'running' | 'complete' | 'error';

export interface ParseStagesState {
	[stage: string]: {
		status: StageStatus;
		detail?: string;
	};
}

export interface CharacterEntry {
	name: string;
	status: 'running' | 'complete';
}

interface Props {
	stages: ParseStagesState;
	characters: CharacterEntry[];
	verboseLog?: ParseVerboseEvent[];
	onCancel?: () => void;
}

const ORDERED_STAGES: Array<{ key: string; label: string }> = [
	{ key: 'story.census', label: 'Cataloguing entities' },
	{ key: 'story.core+locations', label: 'Story core & locations' },
	{ key: 'story.characters', label: 'Deep-diving characters' },
	{ key: 'story.relationships', label: 'Mapping relationships' },
	{ key: 'story.memories', label: 'Reconstructing timeline' },
	{ key: 'story.identities', label: 'Resolving identities' },
];

function StageIcon({ status }: { status: StageStatus | undefined }) {
	if (!status || status === 'pending') {
		return (
			<span class="inline-block w-3.5 text-center text-[11px] text-text-muted opacity-40">
				○
			</span>
		);
	}
	if (status === 'running') {
		return (
			<span class="inline-block w-3.5 animate-spin-slow text-center text-[11px] text-accent">
				◌
			</span>
		);
	}
	if (status === 'complete') {
		return (
			<span class="inline-block w-3.5 text-center text-[11px] text-accent">
				✓
			</span>
		);
	}
	return (
		<span class="inline-block w-3.5 text-center text-[11px] text-error">
			✗
		</span>
	);
}

export function applyProgressEvent(
	prev: ParseStagesState,
	frame: import('@/src/lib/stream').ParseProgressFrame,
): ParseStagesState {
	const { stage, status, data } = frame;
	const next = { ...prev };

	if (stage === 'story.character') {
		// sub-stage — handled separately via characters array
		return next;
	}

	const existing = next[stage] ?? { status: 'pending' };

	let detail: string | undefined = existing.detail;
	if (status === 'complete' && data) {
		if (stage === 'story.census') {
			const chars = data.characterCount ?? 0;
			const locs = data.locationCount ?? 0;
			detail = `${chars} character${chars !== 1 ? 's' : ''}, ${locs} location${locs !== 1 ? 's' : ''}`;
		} else if (stage === 'story.core+locations') {
			const locs = data.locationCount ?? 0;
			detail = `${locs} location${locs !== 1 ? 's' : ''}`;
		} else if (stage === 'story.characters') {
			const count = data.count ?? 0;
			detail = `${count} character${count !== 1 ? 's' : ''}`;
		} else if (stage === 'story.memories') {
			const count = data.count ?? 0;
			detail = `${count} event${count !== 1 ? 's' : ''}`;
		}
	}

	next[stage] = {
		detail,
		status:
			status === 'start'
				? 'running'
				: status === 'complete'
					? 'complete'
					: 'error',
	};
	return next;
}

function formatMs(ms: number): string {
	return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function VerboseEntry({ entry }: { entry: ParseVerboseEvent }) {
	const [expanded, setExpanded] = useState(false);
	const isRequest = entry.step === 'request';

	const chunkLabel =
		entry.totalChunks && entry.totalChunks > 1
			? ` [${entry.chunkIndex}/${entry.totalChunks}]`
			: '';

	const preview = isRequest
		? entry.prompt
			? `${entry.prompt.length} chars`
			: ''
		: entry.durationMs !== undefined
			? formatMs(entry.durationMs)
			: '';

	const expandedContent = isRequest ? entry.prompt : entry.rawText;

	return (
		<div class="border-border/30 border-b last:border-0">
			<button
				type="button"
				class="flex w-full items-baseline gap-1.5 rounded px-1 py-[3px] text-left transition-colors hover:bg-surface-1/40"
				onClick={() => setExpanded((v) => !v)}
			>
				<span
					class={`shrink-0 font-mono text-[10px] ${isRequest ? 'text-blue-400' : 'text-green-400'}`}
				>
					{isRequest ? '→' : '←'}
				</span>
				<span class="truncate font-mono text-[11px] text-text-primary">
					{entry.agent}
					{chunkLabel}
				</span>
				<span class="ml-auto shrink-0 font-mono text-[10px] text-text-muted">
					{preview}
				</span>
				<span class="shrink-0 text-[9px] text-text-muted opacity-50">
					{expanded ? '▲' : '▼'}
				</span>
			</button>

			{expanded && expandedContent && (
				<pre class="mx-1 mb-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-surface-1 p-2 font-mono text-[10px] text-text-muted">
					{expandedContent}
				</pre>
			)}
		</div>
	);
}

export function ParseProgressLog({
	stages,
	characters,
	verboseLog,
	onCancel,
}: Props) {
	const [showVerbose, setShowVerbose] = useState(false);

	return (
		<div class="flex flex-col gap-1">
			<div class="mb-3 flex items-center justify-between">
				<span class="font-semibold text-[11px] text-text-muted uppercase tracking-[0.06em]">
					Extracting story…
				</span>
				{onCancel && (
					<button
						type="button"
						class="text-[11px] text-text-muted transition-colors duration-100 hover:text-text-primary"
						onClick={onCancel}
					>
						Cancel
					</button>
				)}
			</div>

			{ORDERED_STAGES.map(({ key, label }) => {
				const entry = stages[key];
				const status = entry?.status;
				const isActive = status === 'running' || status === 'complete';

				return (
					<div key={key}>
						<div
							class={`flex items-baseline gap-2 py-[3px] text-[13px] transition-colors duration-150 ${
								isActive
									? 'text-text-primary'
									: 'text-text-muted opacity-50'
							}`}
						>
							<StageIcon status={status} />
							<span class="flex-1">{label}</span>
							{entry?.detail && (
								<span class="shrink-0 text-[11px] text-text-muted">
									{entry.detail}
								</span>
							)}
						</div>

						{key === 'story.characters' &&
							characters.length > 0 && (
								<div class="mt-0.5 ml-5 flex flex-col gap-[2px]">
									{characters.map((c) => (
										<div
											key={c.name}
											class="flex items-baseline gap-1.5 text-[12px] text-text-muted"
										>
											<StageIcon status={c.status} />
											<span>{c.name}</span>
										</div>
									))}
								</div>
							)}
					</div>
				);
			})}

			{verboseLog && verboseLog.length > 0 && (
				<div class="mt-3 border-border border-t pt-2">
					<button
						type="button"
						class="flex w-full items-center gap-1.5 font-semibold text-[10px] text-text-muted uppercase tracking-widest transition-colors hover:text-text-primary"
						onClick={() => setShowVerbose((v) => !v)}
					>
						<span>LLM calls ({verboseLog.length})</span>
						<span class="ml-auto opacity-50">
							{showVerbose ? '▲' : '▼'}
						</span>
					</button>

					{showVerbose && (
						<div class="mt-1 max-h-64 overflow-y-auto rounded border border-border/40 bg-surface-0">
							{verboseLog.map((entry, i) => (
								<VerboseEntry key={i} entry={entry} />
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
