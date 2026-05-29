import type { ImportJobEvent, ImportJobPartialResult } from '@simplechat/types';
import { useEffect, useMemo, useState } from 'preact/hooks';
import {
	categoryForEvent,
	useImportJobStore,
} from '../../../store/import-jobs.js';
import { Button } from '../../shared/Button.js';
import { StoryPreviewPanel } from './live-preview-panel.js';

type TabKey = 'overview' | 'timeline' | 'console' | 'payload' | 'preview';

function formatTs(value: string | null | undefined): string {
	if (!value) return '—';
	try {
		return new Date(value).toLocaleTimeString();
	} catch {
		return value;
	}
}

function summarisePayload(event: ImportJobEvent): string {
	if (event.kind === 'llm_request') {
		return `${event.payload.scope ?? 'llm'} · ${String(event.payload.model ?? '')}`;
	}
	if (event.kind === 'llm_response') {
		return `${event.payload.scope ?? 'llm'} · ${String(event.payload.durationMs ?? 0)}ms`;
	}
	if (event.kind === 'partial_result') {
		return `${String(event.payload.slice ?? 'slice')} updated`;
	}
	if (event.kind === 'entity_routed') {
		return `${String(event.payload.entityLabel ?? 'entity')} -> ${String(event.payload.chunkCount ?? 0)} chunks`;
	}
	if (event.kind === 'index_complete' || event.kind === 'routing_complete') {
		return `${String(event.payload.candidateCountAfterSelection ?? event.payload.characterCount ?? '')}`;
	}
	if (
		'message' in event.payload &&
		typeof event.payload.message === 'string'
	) {
		return event.payload.message;
	}
	if ('name' in event.payload && typeof event.payload.name === 'string') {
		return event.payload.name;
	}
	const keys = Object.keys(event.payload);
	return keys.length > 0 ? keys.join(', ') : 'No payload';
}

function stageToPreviewStep(stage: string | null | undefined): number {
	switch (stage) {
		case 'story.index':
			return 1;
		case 'story.census':
			return 1;
		case 'story.core+locations':
			return 1;
		case 'story.characters':
			return 2;
		case 'story.relationships':
			return 2;
		case 'story.memories':
			return 4;
		case 'story.identities':
			return 4;
		default:
			return 0;
	}
}

function toPreview(result: ImportJobPartialResult | undefined | null) {
	return {
		characters: (result?.characters ?? []).map((character) => ({
			isUserPersona: character.isUserPersona,
			name: character.name,
			role: character.role,
		})),
		genres: result?.storyCore?.genres ?? [],
		locations: (result?.locations ?? []).map((location) => ({
			description: location.description,
			name: location.name,
		})),
		memories: (result?.memories ?? []).map((memory) => ({
			characterName: memory.characterName,
			importance: memory.importance,
			summary: memory.summary,
		})),
		title: result?.storyCore?.title ?? '',
		tone: result?.storyCore?.tone ?? [],
	};
}

export function ImportJobPanel() {
	const [tab, setTab] = useState<TabKey>('overview');
	const activeJobId = useImportJobStore((state) => state.activeJobId);
	const cancelActiveJob = useImportJobStore((state) => state.cancelActiveJob);
	const clearRecentJobs = useImportJobStore((state) => state.clearRecentJobs);
	const connectionStatus = useImportJobStore(
		(state) => state.connectionStatus,
	);
	const deleteJob = useImportJobStore((state) => state.deleteJob);
	const events = useImportJobStore((state) => state.events);
	const filters = useImportJobStore((state) => state.filters);
	const loadRecentJobs = useImportJobStore((state) => state.loadRecentJobs);
	const openJob = useImportJobStore((state) => state.openJob);
	const recentJobs = useImportJobStore((state) => state.recentJobs);
	const selectedEventSeq = useImportJobStore(
		(state) => state.selectedEventSeq,
	);
	const setSelectedEventSeq = useImportJobStore(
		(state) => state.setSelectedEventSeq,
	);
	const snapshot = useImportJobStore((state) => state.snapshot);
	const toggleCategory = useImportJobStore((state) => state.toggleCategory);

	useEffect(() => {
		void loadRecentJobs();
	}, [loadRecentJobs]);

	const filteredEvents = useMemo(
		() =>
			events.filter((event) =>
				filters.categories.includes(categoryForEvent(event)),
			),
		[events, filters.categories],
	);

	const selectedEvent =
		filteredEvents.find((event) => event.seq === selectedEventSeq) ??
		filteredEvents.at(-1) ??
		null;
	const consoleEvents = useMemo(
		() =>
			events.filter(
				(event) =>
					event.kind === 'warning' ||
					event.kind === 'stage_error' ||
					event.kind === 'index_error' ||
					event.kind === 'routing_error' ||
					event.kind === 'character_error' ||
					event.kind === 'chunk_error' ||
					event.kind === 'skill_error' ||
					event.kind === 'agent_error' ||
					event.kind === 'tool_error' ||
					event.kind === 'job_failed' ||
					event.kind === 'llm_retry',
			),
		[events],
	);

	const preview = toPreview(snapshot?.partialResult);
	const characterCounts = {
		complete:
			snapshot?.characterProgress.filter(
				(entry) => entry.status === 'complete',
			).length ?? 0,
		error:
			snapshot?.characterProgress.filter(
				(entry) => entry.status === 'error',
			).length ?? 0,
		running:
			snapshot?.characterProgress.filter(
				(entry) => entry.status === 'running',
			).length ?? 0,
	};

	return (
		<div class="flex flex-col gap-3">
			<div class="flex items-center gap-2">
				{(
					[
						'overview',
						'timeline',
						'console',
						'payload',
						'preview',
					] as TabKey[]
				).map((entry) => (
					<button
						key={entry}
						type="button"
						class="rounded border border-border px-2 py-1 text-[11px] text-text-muted transition-colors hover:text-text-primary data-[active=true]:border-accent data-[active=true]:text-accent"
						data-active={tab === entry ? 'true' : undefined}
						onClick={() => setTab(entry)}
					>
						{entry}
					</button>
				))}
				<div class="ml-auto flex items-center gap-2">
					<span class="text-[11px] text-text-muted">
						{connectionStatus}
					</span>
					{activeJobId && (
						<Button
							size="small"
							variant="secondary"
							onClick={() => void cancelActiveJob()}
						>
							Cancel
						</Button>
					)}
					<Button
						size="small"
						variant="ghost"
						onClick={() => void clearRecentJobs()}
					>
						Flush all
					</Button>
				</div>
			</div>

			{tab === 'overview' && (
				<div class="flex flex-col gap-3 text-[12px] text-text-secondary">
					<div class="grid grid-cols-2 gap-2 rounded border border-border bg-bg-secondary p-3">
						<div>
							<div class="text-[10px] text-text-muted uppercase tracking-widest">
								Job
							</div>
							<div class="font-mono text-[11px] text-text-primary">
								{activeJobId ?? '—'}
							</div>
						</div>
						<div>
							<div class="text-[10px] text-text-muted uppercase tracking-widest">
								Status
							</div>
							<div class="text-text-primary">
								{snapshot?.status ?? 'idle'}
							</div>
						</div>
						<div>
							<div class="text-[10px] text-text-muted uppercase tracking-widest">
								Current Stage
							</div>
							<div class="text-text-primary">
								{snapshot?.currentStage ?? '—'}
							</div>
						</div>
						<div>
							<div class="text-[10px] text-text-muted uppercase tracking-widest">
								Last Heartbeat
							</div>
							<div class="text-text-primary">
								{formatTs(snapshot?.lastHeartbeatAt)}
							</div>
						</div>
						<div>
							<div class="text-[10px] text-text-muted uppercase tracking-widest">
								Warnings
							</div>
							<div class="text-text-primary">
								{snapshot?.warningCount ?? 0}
							</div>
						</div>
						<div>
							<div class="text-[10px] text-text-muted uppercase tracking-widest">
								Events
							</div>
							<div class="text-text-primary">
								{snapshot?.lastSeq ?? 0}
							</div>
						</div>
					</div>

					<div class="rounded border border-border bg-bg-secondary p-3">
						<div class="mb-2 text-[10px] text-text-muted uppercase tracking-widest">
							Character Workers
						</div>
						<div class="flex gap-3 text-[12px]">
							<span>running: {characterCounts.running}</span>
							<span>complete: {characterCounts.complete}</span>
							<span>error: {characterCounts.error}</span>
						</div>
						{snapshot?.characterProgress.length ? (
							<div class="mt-2 flex flex-col gap-1">
								{snapshot.characterProgress.map((entry) => (
									<div
										key={entry.name}
										class="flex items-center justify-between rounded bg-bg-hover px-2 py-1"
									>
										<span>{entry.name}</span>
										<span class="text-[11px] text-text-muted">
											{entry.status}
										</span>
									</div>
								))}
							</div>
						) : null}
					</div>

					<div class="rounded border border-border bg-bg-secondary p-3">
						<div class="mb-2 text-[10px] text-text-muted uppercase tracking-widest">
							Recent Jobs
						</div>
						<div class="flex flex-col gap-2">
							{recentJobs.length === 0 ? (
								<div class="text-[11px] text-text-muted">
									No recent import jobs
								</div>
							) : (
								recentJobs.map((job) => (
									<div
										key={job.jobId}
										class="flex items-center gap-2 rounded bg-bg-hover px-2 py-2"
									>
										<div class="min-w-0 flex-1">
											<div class="truncate font-mono text-[11px] text-text-primary">
												{job.jobId}
											</div>
											<div class="truncate text-[11px] text-text-muted">
												{job.sourcePreview}
											</div>
										</div>
										<div class="text-[11px] text-text-muted">
											{job.status}
										</div>
										<Button
											size="small"
											variant="ghost"
											onClick={() =>
												void openJob(job.jobId, true)
											}
										>
											Open
										</Button>
										<Button
											size="small"
											variant="ghost"
											onClick={() =>
												void deleteJob(job.jobId)
											}
										>
											Delete
										</Button>
									</div>
								))
							)}
						</div>
					</div>
				</div>
			)}

			{tab === 'timeline' && (
				<div class="flex flex-col gap-3">
					<div class="flex flex-wrap gap-2">
						{(
							[
								'lifecycle',
								'stage',
								'chunk',
								'skill',
								'agent',
								'tool',
								'llm',
								'heartbeat',
								'warning',
								'error',
								'preview',
							] as const
						).map((category) => (
							<button
								key={category}
								type="button"
								class="rounded border border-border px-2 py-1 text-[11px] text-text-muted transition-colors hover:text-text-primary data-[active=true]:border-accent data-[active=true]:text-accent"
								data-active={
									filters.categories.includes(category)
										? 'true'
										: undefined
								}
								onClick={() => toggleCategory(category)}
							>
								{category}
							</button>
						))}
					</div>

					<div class="max-h-96 overflow-y-auto rounded border border-border bg-bg-secondary">
						{filteredEvents.map((event) => (
							<button
								key={event.seq}
								type="button"
								class="flex w-full items-start gap-3 border-border/40 border-b px-3 py-2 text-left last:border-0 hover:bg-bg-hover data-[active=true]:bg-accent-dim/20"
								data-active={
									selectedEvent?.seq === event.seq
										? 'true'
										: undefined
								}
								onClick={() => setSelectedEventSeq(event.seq)}
							>
								<span class="font-mono text-[11px] text-text-muted">
									#{event.seq}
								</span>
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<span class="font-medium text-[12px] text-text-primary">
											{event.kind}
										</span>
										{event.stage && (
											<span class="rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] text-text-muted">
												{event.stage}
											</span>
										)}
									</div>
									<div class="truncate text-[11px] text-text-muted">
										{summarisePayload(event)}
									</div>
								</div>
								<span class="shrink-0 text-[10px] text-text-muted">
									{formatTs(event.timestamp)}
								</span>
							</button>
						))}
					</div>
				</div>
			)}

			{tab === 'console' && (
				<div class="max-h-96 overflow-y-auto rounded border border-border bg-bg-secondary">
					{consoleEvents.length === 0 ? (
						<div class="px-3 py-4 text-[12px] text-text-muted">
							No warnings or errors for this run.
						</div>
					) : (
						consoleEvents.map((event) => (
							<div
								key={event.seq}
								class="border-border/40 border-b px-3 py-2 last:border-0"
							>
								<div class="flex items-center gap-2">
									<span class="font-mono text-[11px] text-text-muted">
										#{event.seq}
									</span>
									<span class="font-medium text-[12px] text-text-primary">
										{event.kind}
									</span>
									{event.stage && (
										<span class="rounded bg-bg-hover px-1.5 py-0.5 text-[10px] text-text-muted">
											{event.stage}
										</span>
									)}
									<span class="ml-auto text-[10px] text-text-muted">
										{formatTs(event.timestamp)}
									</span>
								</div>
								<pre class="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-bg-hover p-2 text-[11px] text-text-secondary">
									{JSON.stringify(event.payload, null, 2)}
								</pre>
							</div>
						))
					)}
				</div>
			)}

			{tab === 'payload' && (
				<div class="rounded border border-border bg-bg-secondary p-3">
					{selectedEvent ? (
						<>
							<div class="mb-2 flex items-center gap-2">
								<span class="font-medium text-text-primary">
									{selectedEvent.kind}
								</span>
								<span class="text-[11px] text-text-muted">
									#{selectedEvent.seq}
								</span>
							</div>
							<pre class="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded bg-bg-hover p-3 text-[11px] text-text-secondary">
								{JSON.stringify(selectedEvent, null, 2)}
							</pre>
						</>
					) : (
						<div class="text-[12px] text-text-muted">
							Select an event from the timeline to inspect it.
						</div>
					)}
				</div>
			)}

			{tab === 'preview' && (
				<div class="rounded border border-border bg-bg-secondary p-3">
					<StoryPreviewPanel
						genStep={stageToPreviewStep(snapshot?.currentStage)}
						preview={preview}
						tab="import"
					/>
				</div>
			)}
		</div>
	);
}
