import type {
	ImportJobCharacterProgress,
	ImportJobEvent,
	ImportJobPartialResult,
	ImportJobSnapshot,
	ImportJobStatus,
	ImportJobSummary,
} from '@simplechat/types';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { api } from '../lib/api.js';
import { tailImportJobEvents } from '../lib/import-jobs.js';

export type ImportConnectionStatus =
	| 'idle'
	| 'connecting'
	| 'live'
	| 'reconnecting'
	| 'disconnected'
	| 'completed'
	| 'failed'
	| 'cancelled';

export type ImportTraceCategory =
	| 'lifecycle'
	| 'stage'
	| 'chunk'
	| 'skill'
	| 'agent'
	| 'tool'
	| 'llm'
	| 'heartbeat'
	| 'warning'
	| 'error'
	| 'preview';

export interface ImportTraceFilters {
	categories: ImportTraceCategory[];
}

interface ImportJobState {
	activeJobId: string | null;
	connectionStatus: ImportConnectionStatus;
	draftText: string;
	error: string | null;
	events: ImportJobEvent[];
	filters: ImportTraceFilters;
	lastSeenSeq: number;
	loadRecentJobs: () => Promise<void>;
	openJob: (jobId: string, replayFromStart?: boolean) => Promise<void>;
	recentJobs: ImportJobSummary[];
	resumeLatestJob: () => Promise<void>;
	selectedEventSeq: number | null;
	setConnectionStatus: (status: ImportConnectionStatus) => void;
	setDraftText: (text: string) => void;
	setSelectedEventSeq: (seq: number | null) => void;
	snapshot: ImportJobSnapshot | null;
	startImport: (context?: Record<string, unknown>) => Promise<void>;
	stopWatching: () => void;
	cancelActiveJob: () => Promise<void>;
	clearJob: () => void;
	clearRecentJobs: () => Promise<void>;
	deleteJob: (jobId: string) => Promise<void>;
	toggleCategory: (category: ImportTraceCategory) => void;
}

const DEFAULT_CATEGORIES: ImportTraceCategory[] = [
	'lifecycle',
	'stage',
	'chunk',
	'skill',
	'agent',
	'tool',
	'llm',
	'preview',
	'warning',
	'error',
];

const runtime = {
	controller: null as AbortController | null,
	currentJobId: null as string | null,
	manualStop: false,
	reconnectTimer: null as ReturnType<typeof setTimeout> | null,
};

function isTerminalStatus(status: ImportJobStatus): boolean {
	return (
		status === 'completed' || status === 'failed' || status === 'cancelled'
	);
}

function statusToConnection(status: ImportJobStatus): ImportConnectionStatus {
	if (status === 'completed') return 'completed';
	if (status === 'failed') return 'failed';
	if (status === 'cancelled') return 'cancelled';
	return 'live';
}

function shouldAutoResume(
	activeJobId: string | null,
	snapshot: ImportJobSnapshot | null,
): boolean {
	return (
		!!activeJobId &&
		!!snapshot &&
		(snapshot.status === 'queued' || snapshot.status === 'running')
	);
}

function upsertCharacterProgress(
	list: ImportJobCharacterProgress[],
	update: ImportJobCharacterProgress,
): ImportJobCharacterProgress[] {
	const next = list.filter((entry) => entry.name !== update.name);
	next.push(update);
	return next.sort((a, b) => a.name.localeCompare(b.name));
}

function applyEventToSnapshot(
	snapshot: ImportJobSnapshot | null,
	event: ImportJobEvent,
): ImportJobSnapshot | null {
	if (!snapshot) return snapshot;

	const next: ImportJobSnapshot = {
		...snapshot,
		lastSeq: Math.max(snapshot.lastSeq, event.seq),
		updatedAt: event.timestamp,
	};

	switch (event.kind) {
		case 'job_started':
			next.status = 'running';
			next.error = null;
			return next;
		case 'job_completed':
			next.currentStage = null;
			next.status = 'completed';
			return next;
		case 'job_failed':
			next.currentStage = null;
			next.error =
				typeof event.payload.error === 'string'
					? event.payload.error
					: 'Import failed';
			next.status = 'failed';
			return next;
		case 'job_cancelled':
			next.currentStage = null;
			next.status = 'cancelled';
			return next;
		case 'stage_start':
		case 'index_start':
		case 'routing_start':
			next.currentStage = event.stage ?? next.currentStage;
			return next;
		case 'stage_complete':
		case 'index_complete':
		case 'routing_complete':
			return next;
		case 'stage_error':
		case 'index_error':
		case 'routing_error':
			next.error =
				typeof event.payload.message === 'string'
					? event.payload.message
					: next.error;
			return next;
		case 'character_start':
			next.characterProgress = upsertCharacterProgress(
				next.characterProgress,
				{
					detail:
						typeof event.payload.detail === 'string'
							? event.payload.detail
							: undefined,
					name:
						typeof event.payload.name === 'string'
							? event.payload.name
							: 'unknown',
					status: 'running',
					updatedAt: event.timestamp,
				},
			);
			return next;
		case 'character_complete':
			next.characterProgress = upsertCharacterProgress(
				next.characterProgress,
				{
					detail:
						typeof event.payload.detail === 'string'
							? event.payload.detail
							: undefined,
					name:
						typeof event.payload.name === 'string'
							? event.payload.name
							: 'unknown',
					status: 'complete',
					updatedAt: event.timestamp,
				},
			);
			return next;
		case 'character_error':
			next.characterProgress = upsertCharacterProgress(
				next.characterProgress,
				{
					detail:
						typeof event.payload.message === 'string'
							? event.payload.message
							: undefined,
					name:
						typeof event.payload.name === 'string'
							? event.payload.name
							: 'unknown',
					status: 'error',
					updatedAt: event.timestamp,
				},
			);
			return next;
		case 'partial_result': {
			const slice = event.payload.slice;
			const value = event.payload.value;
			if (
				slice !== 'storyCore' &&
				slice !== 'characters' &&
				slice !== 'locations' &&
				slice !== 'memories'
			) {
				return next;
			}
			next.partialResult = {
				...next.partialResult,
				[slice]: value,
			} as ImportJobPartialResult;
			return next;
		}
		case 'warning':
			next.warningCount += 1;
			return next;
		case 'heartbeat':
			next.lastHeartbeatAt = event.timestamp;
			return next;
		default:
			return next;
	}
}

function categoryForEvent(event: ImportJobEvent): ImportTraceCategory {
	switch (event.kind) {
		case 'job_created':
		case 'job_started':
		case 'job_completed':
		case 'job_failed':
		case 'job_cancelled':
			return 'lifecycle';
		case 'stage_start':
		case 'stage_complete':
		case 'stage_error':
		case 'index_start':
		case 'index_complete':
		case 'index_error':
		case 'routing_start':
		case 'routing_complete':
		case 'routing_error':
			return 'stage';
		case 'character_start':
		case 'character_complete':
		case 'character_error':
		case 'entity_routed':
		case 'chunk_plan_created':
		case 'chunk_start':
		case 'chunk_complete':
		case 'chunk_error':
			return 'chunk';
		case 'consolidation_start':
		case 'consolidation_complete':
		case 'consolidation_error':
			return 'stage';
		case 'skill_call':
		case 'skill_result':
		case 'skill_error':
			return 'skill';
		case 'agent_start':
		case 'agent_complete':
		case 'agent_error':
		case 'agent_handoff':
			return 'agent';
		case 'tool_call':
		case 'tool_result':
		case 'tool_error':
		case 'mcp_stage_enabled':
		case 'mcp_stage_skipped':
			return 'tool';
		case 'llm_request':
		case 'llm_response':
		case 'llm_retry':
			return 'llm';
		case 'heartbeat':
			return 'heartbeat';
		case 'warning':
			return 'warning';
		case 'partial_result':
			return 'preview';
		default:
			return 'error';
	}
}

function stopRuntime() {
	runtime.manualStop = true;
	runtime.controller?.abort();
	runtime.controller = null;
	runtime.currentJobId = null;
	if (runtime.reconnectTimer) {
		clearTimeout(runtime.reconnectTimer);
		runtime.reconnectTimer = null;
	}
}

export const useImportJobStore = create<ImportJobState>()(
	persist(
		(set, get) => ({
			activeJobId: null,
			cancelActiveJob: async () => {
				const { activeJobId } = get();
				if (!activeJobId) return;
				const snapshot = await api.importJobs.cancel(activeJobId);
				if (isTerminalStatus(snapshot.status)) {
					stopRuntime();
				}
				set((state) => ({
					activeJobId: isTerminalStatus(snapshot.status)
						? null
						: state.activeJobId,
					connectionStatus: statusToConnection(snapshot.status),
					error: snapshot.error,
					snapshot,
				}));
			},
			clearJob: () => {
				stopRuntime();
				set({
					activeJobId: null,
					connectionStatus: 'idle',
					error: null,
					events: [],
					lastSeenSeq: 0,
					selectedEventSeq: null,
					snapshot: null,
				});
			},
			clearRecentJobs: async () => {
				stopRuntime();
				await api.importJobs.clearAll();
				set({
					activeJobId: null,
					connectionStatus: 'idle',
					error: null,
					events: [],
					lastSeenSeq: 0,
					recentJobs: [],
					selectedEventSeq: null,
					snapshot: null,
				});
			},
			connectionStatus: 'idle',
			deleteJob: async (jobId: string) => {
				const { activeJobId } = get();
				if (activeJobId === jobId) {
					stopRuntime();
				}
				await api.importJobs.delete(jobId);
				set((state) => ({
					activeJobId:
						state.activeJobId === jobId ? null : state.activeJobId,
					connectionStatus:
						state.activeJobId === jobId
							? 'idle'
							: state.connectionStatus,
					error: state.activeJobId === jobId ? null : state.error,
					events: state.activeJobId === jobId ? [] : state.events,
					lastSeenSeq:
						state.activeJobId === jobId ? 0 : state.lastSeenSeq,
					recentJobs: state.recentJobs.filter(
						(job) => job.jobId !== jobId,
					),
					selectedEventSeq:
						state.activeJobId === jobId
							? null
							: state.selectedEventSeq,
					snapshot:
						state.activeJobId === jobId ? null : state.snapshot,
				}));
			},
			draftText: '',
			error: null,
			events: [],
			filters: {
				categories: DEFAULT_CATEGORIES,
			},
			lastSeenSeq: 0,
			loadRecentJobs: async () => {
				const recentJobs = await api.importJobs.recent();
				set({ recentJobs });
			},
			openJob: async (jobId: string, replayFromStart = true) => {
				stopRuntime();
				runtime.manualStop = false;
				runtime.currentJobId = jobId;

				const snapshot = await api.importJobs.get(jobId);
				set((state) => ({
					activeJobId: jobId,
					connectionStatus: isTerminalStatus(snapshot.status)
						? statusToConnection(snapshot.status)
						: replayFromStart
							? 'connecting'
							: 'reconnecting',
					error: snapshot.error,
					events: replayFromStart ? [] : state.events,
					lastSeenSeq: replayFromStart ? 0 : state.lastSeenSeq,
					selectedEventSeq: replayFromStart
						? null
						: state.selectedEventSeq,
					snapshot,
				}));

				if (isTerminalStatus(snapshot.status)) return;

				const controller = new AbortController();
				runtime.controller = controller;

				await tailImportJobEvents({
					afterSeq: replayFromStart ? 0 : get().lastSeenSeq,
					jobId,
					onClose: () => {
						const current = get();
						const latestSnapshot = current.snapshot;
						if (
							runtime.manualStop ||
							runtime.currentJobId !== jobId
						) {
							return;
						}
						if (
							latestSnapshot &&
							!isTerminalStatus(latestSnapshot.status)
						) {
							set({ connectionStatus: 'disconnected' });
							runtime.reconnectTimer = setTimeout(() => {
								void get().openJob(jobId, false);
							}, 5000);
						}
					},
					onError: (message) => {
						if (
							runtime.manualStop ||
							runtime.currentJobId !== jobId
						) {
							return;
						}
						set({
							connectionStatus: 'disconnected',
							error: message,
						});
					},
					onEvent: (event) => {
						set((state) => {
							if (state.activeJobId !== jobId) return state;
							const events =
								event.seq <= state.lastSeenSeq
									? state.events
									: [...state.events, event];
							const snapshot = applyEventToSnapshot(
								state.snapshot,
								event,
							);
							const terminal =
								!!snapshot && isTerminalStatus(snapshot.status);
							const connectionStatus =
								snapshot && isTerminalStatus(snapshot.status)
									? statusToConnection(snapshot.status)
									: 'live';
							return {
								activeJobId: terminal
									? null
									: state.activeJobId,
								connectionStatus,
								error:
									connectionStatus === 'failed'
										? (snapshot?.error ?? state.error)
										: state.error,
								events,
								lastSeenSeq: Math.max(
									state.lastSeenSeq,
									event.seq,
								),
								snapshot,
							};
						});
					},
					signal: controller.signal,
				});
			},
			recentJobs: [],
			resumeLatestJob: async () => {
				await get().loadRecentJobs();
				const { activeJobId, snapshot } = get();
				if (shouldAutoResume(activeJobId, snapshot)) {
					await get().openJob(activeJobId as string, true);
				}
			},
			selectedEventSeq: null,
			setConnectionStatus: (connectionStatus) =>
				set({ connectionStatus }),
			setDraftText: (draftText) => set({ draftText }),
			setSelectedEventSeq: (selectedEventSeq) =>
				set({ selectedEventSeq }),
			snapshot: null,
			startImport: async (context?: Record<string, unknown>) => {
				const { draftText } = get();
				if (!draftText.trim()) return;
				stopRuntime();
				set({
					connectionStatus: 'connecting',
					error: null,
					events: [],
					lastSeenSeq: 0,
					selectedEventSeq: null,
					snapshot: null,
				});
				const { jobId } = await api.importJobs.create(
					draftText.trim(),
					context,
				);
				await get().openJob(jobId, true);
			},
			stopWatching: () => {
				stopRuntime();
				set((state) => ({
					connectionStatus:
						state.snapshot &&
						isTerminalStatus(state.snapshot.status)
							? statusToConnection(state.snapshot.status)
							: 'disconnected',
				}));
			},
			toggleCategory: (category) =>
				set((state) => {
					const categories = state.filters.categories.includes(
						category,
					)
						? state.filters.categories.filter(
								(entry) => entry !== category,
							)
						: [...state.filters.categories, category];
					return {
						filters: {
							...state.filters,
							categories,
						},
					};
				}),
		}),
		{
			name: 'simplechat-import-job',
			partialize: (state) => ({
				activeJobId:
					state.snapshot && !isTerminalStatus(state.snapshot.status)
						? state.activeJobId
						: null,
				draftText: state.draftText,
				filters: state.filters,
				lastSeenSeq: state.lastSeenSeq,
				snapshot: state.snapshot,
			}),
			storage: createJSONStorage(() => sessionStorage),
		},
	),
);

export { categoryForEvent };
