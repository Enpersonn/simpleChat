import { createHash, randomUUID } from 'node:crypto';
import type {
	ImportJobCharacterProgress,
	ImportJobEvent,
	ImportJobEventKind,
	ImportJobPartialResult,
	ImportJobSnapshot,
	ImportJobStatus,
	ImportJobSummary,
} from '@simplechat/types';
import {
	ImportJobEventSchema,
	ImportJobSnapshotSchema,
} from '@simplechat/types';
import { now } from '../../storage/helpers.js';
import type { ParseContext } from '../../LLM/parsing/service.js';
import {
	appendImportJobEvent,
	clearImportJobs,
	deleteImportJob,
	listRecentImportJobs,
	pruneImportJobs,
	readImportJobEventsAfter,
	readImportJobSnapshot,
	writeImportJobSnapshot,
} from './storage.js';
import type {
	ParseTraceCharacterUpdate,
	ParseTraceEmitter,
	ParseTraceEventInput,
	ParseTracePartialUpdate,
} from '../../LLM/parsing/trace-types.js';

export interface ImportJobRunInput {
	context?: ParseContext;
	jobId: string;
	signal: AbortSignal;
	sourceText: string;
	trace: ParseTraceEmitter;
}

type JobSubscriber = (event: ImportJobEvent) => void;

type LiveImportJob = {
	context?: ParseContext;
	controller: AbortController;
	heartbeatTimer: NodeJS.Timeout | null;
	runPromise: Promise<void> | null;
	snapshot: ImportJobSnapshot;
	sourceText: string;
	subscribers: Set<JobSubscriber>;
	writeQueue: Promise<void>;
};

const isTerminalStatus = (status: ImportJobStatus): boolean =>
	status === 'completed' || status === 'failed' || status === 'cancelled';

const toPreview = (text: string): string =>
	text.replace(/\s+/g, ' ').trim().slice(0, 160);

const sourceHash = (text: string): string =>
	createHash('sha256').update(text).digest('hex');

export class ImportJobManager {
	private jobs = new Map<string, LiveImportJob>();

	constructor(
		private readonly runner: (input: ImportJobRunInput) => Promise<ImportJobPartialResult>,
	) {}

	async createJob(input: {
		context?: ParseContext;
		sourceText: string;
	}): Promise<ImportJobSnapshot> {
		const jobId = randomUUID();
		const snapshot = ImportJobSnapshotSchema.parse({
			characterProgress: [],
			createdAt: now(),
			currentStage: null,
			error: null,
			jobId,
			lastHeartbeatAt: null,
			lastSeq: 0,
			partialResult: {
				storyCore: null,
				characters: [],
				locations: [],
				memories: [],
			},
			sourceHash: sourceHash(input.sourceText),
			sourceLength: input.sourceText.length,
			sourcePreview: toPreview(input.sourceText),
			status: 'queued',
			updatedAt: now(),
			warningCount: 0,
		});

		const job: LiveImportJob = {
			context: input.context,
			controller: new AbortController(),
			heartbeatTimer: null,
			runPromise: null,
			snapshot,
			sourceText: input.sourceText,
			subscribers: new Set(),
			writeQueue: Promise.resolve(),
		};

		this.jobs.set(jobId, job);
		await writeImportJobSnapshot(snapshot);
			await this.emit(jobId, {
				kind: 'job_created',
				payload: {
					sourceLength: snapshot.sourceLength,
					sourcePreview: snapshot.sourcePreview,
				},
			});
			this.startJob(jobId);
			return snapshot;
		}

	async getSnapshot(jobId: string): Promise<ImportJobSnapshot | null> {
		const liveJob = this.jobs.get(jobId);
		if (liveJob) return liveJob.snapshot;

		const snapshot = await readImportJobSnapshot(jobId);
		if (!snapshot) return null;
		if (!isTerminalStatus(snapshot.status)) {
			const reconciled = ImportJobSnapshotSchema.parse({
				...snapshot,
				currentStage: null,
				error:
					snapshot.error ??
					'Import job is no longer running on the server.',
				status: 'failed',
				updatedAt: now(),
			});
			await writeImportJobSnapshot(reconciled);
			return reconciled;
		}
		return snapshot;
	}

	async getRecentJobs(): Promise<ImportJobSummary[]> {
		const jobs = await listRecentImportJobs();
		return Promise.all(
			jobs.map(async (job) => {
				const snapshot = await this.getSnapshot(job.jobId);
				return (snapshot ?? job) as ImportJobSummary;
			}),
		);
	}

	async deleteJob(jobId: string): Promise<void> {
		const liveJob = this.jobs.get(jobId);
		if (liveJob) {
			liveJob.controller.abort(new DOMException('Deleted', 'AbortError'));
			await liveJob.runPromise?.catch(() => undefined);
			this.jobs.delete(jobId);
		}
		await deleteImportJob(jobId);
	}

	async clearAllJobs(): Promise<void> {
		const liveJobs = [...this.jobs.values()];
		this.jobs.clear();
		for (const job of liveJobs) {
			job.controller.abort(new DOMException('Deleted', 'AbortError'));
		}
		await Promise.all(
			liveJobs.map((job) => job.runPromise?.catch(() => undefined)),
		);
		await clearImportJobs();
	}

	hasLiveJob(jobId: string): boolean {
		return this.jobs.has(jobId);
	}

	async getEventsAfter(jobId: string, afterSeq: number): Promise<ImportJobEvent[]> {
		return readImportJobEventsAfter(jobId, afterSeq);
	}

	async cancelJob(jobId: string): Promise<ImportJobSnapshot | null> {
		const job = this.jobs.get(jobId);
		if (!job) return this.getSnapshot(jobId);
		if (isTerminalStatus(job.snapshot.status)) return job.snapshot;
		job.controller.abort(new DOMException('Cancelled', 'AbortError'));
		await job.runPromise?.catch(() => undefined);
		return job.snapshot;
	}

	addSubscriber(jobId: string, subscriber: JobSubscriber): () => void {
		const job = this.jobs.get(jobId);
		if (!job) return () => {};
		job.subscribers.add(subscriber);
		return () => {
			job.subscribers.delete(subscriber);
			if (
				job.subscribers.size === 0 &&
				isTerminalStatus(job.snapshot.status)
			) {
				this.jobs.delete(jobId);
			}
		};
	}

	createTrace(jobId: string, signal: AbortSignal): ParseTraceEmitter {
		return {
			signal,
			emit: async (event) => {
				await this.emit(jobId, event);
			},
			replacePartial: (update) => this.replacePartial(jobId, update),
			setCharacterProgress: (update) =>
				this.setCharacterProgress(jobId, update),
			setStage: (stage) => this.setStage(jobId, stage),
		};
	}

	private startJob(jobId: string): void {
		const job = this.jobs.get(jobId);
		if (!job) return;
		job.runPromise = (async () => {
			await this.patchSnapshot(jobId, {
				error: null,
				status: 'running',
			});
			await this.emit(jobId, { kind: 'job_started' });
			job.heartbeatTimer = setInterval(() => {
				void this.emit(jobId, {
					kind: 'heartbeat',
					payload: {
						status: job.snapshot.status,
					},
				});
			}, 5000);

			try {
				const trace = this.createTrace(jobId, job.controller.signal);
				const result = await this.runner({
					context: job.context,
					jobId,
					signal: job.controller.signal,
					sourceText: job.sourceText,
					trace,
				});

				await this.patchSnapshot(jobId, {
					partialResult: result,
				});
				await this.emit(jobId, {
					kind: 'job_completed',
					payload: {
						characterCount: result.characters.length,
						locationCount: result.locations.length,
						memoryCount: result.memories.length,
					},
				});
				await this.finishJob(jobId, 'completed');
			} catch (error) {
				if (job.controller.signal.aborted) {
					await this.finishJob(jobId, 'cancelled');
					return;
				}
				const message =
					error instanceof Error ? error.message : 'Import job failed';
				await this.emit(jobId, {
					kind: 'job_failed',
					payload: { error: message },
				});
				await this.finishJob(jobId, 'failed', message);
			}
		})();
	}

	private async finishJob(
		jobId: string,
		status: ImportJobStatus,
		error: string | null = null,
	): Promise<void> {
		const job = this.jobs.get(jobId);
		if (!job) return;
		if (job.heartbeatTimer) {
			clearInterval(job.heartbeatTimer);
			job.heartbeatTimer = null;
		}
		await this.patchSnapshot(jobId, {
			currentStage: null,
			error,
			lastHeartbeatAt: now(),
			status,
		});
		if (job.subscribers.size === 0) {
			this.jobs.delete(jobId);
		}
		void pruneImportJobs();
	}

	private async setStage(jobId: string, stage: string | null): Promise<void> {
		await this.patchSnapshot(jobId, {
			currentStage: stage,
		});
	}

	private async replacePartial(
		jobId: string,
		update: ParseTracePartialUpdate,
	): Promise<void> {
		const job = this.jobs.get(jobId);
		if (!job) return;
		const nextPartial = {
			...job.snapshot.partialResult,
			[update.slice]: update.value,
		};
		await this.patchSnapshot(jobId, {
			partialResult: nextPartial,
		});
		await this.emit(jobId, {
			kind: 'partial_result',
			payload: {
				slice: update.slice,
				value: update.value,
			},
			stage: update.stage ?? null,
		});
	}

	private async setCharacterProgress(
		jobId: string,
		update: ParseTraceCharacterUpdate,
	): Promise<void> {
		const job = this.jobs.get(jobId);
		if (!job) return;

		const existing = job.snapshot.characterProgress.filter(
			(entry: ImportJobCharacterProgress) =>
				entry.name !== update.name,
		);
		const nextEntry: ImportJobCharacterProgress = {
			detail: update.detail,
			name: update.name,
			status: update.status,
			updatedAt: now(),
		};
		await this.patchSnapshot(jobId, {
			characterProgress: [...existing, nextEntry].sort((a, b) =>
				a.name.localeCompare(b.name),
			),
		});
	}

	private async emit(
		jobId: string,
		input: ParseTraceEventInput,
	): Promise<ImportJobEvent> {
		const job = this.jobs.get(jobId);
		if (!job) {
			const snapshot = await this.getSnapshot(jobId);
			if (!snapshot) throw new Error(`Unknown import job: ${jobId}`);
			const event = ImportJobEventSchema.parse({
				jobId,
				kind: input.kind as ImportJobEventKind,
				payload: input.payload ?? {},
				seq: snapshot.lastSeq + 1,
				stage: input.stage ?? null,
				timestamp: now(),
			});
			await appendImportJobEvent(jobId, event);
			return event;
		}

		const event = ImportJobEventSchema.parse({
			jobId,
			kind: input.kind as ImportJobEventKind,
			payload: input.payload ?? {},
			seq: job.snapshot.lastSeq + 1,
			stage: input.stage ?? null,
			timestamp: now(),
		});

		job.snapshot = ImportJobSnapshotSchema.parse({
			...job.snapshot,
			currentStage:
				input.stage !== undefined ? input.stage : job.snapshot.currentStage,
			lastHeartbeatAt:
				event.kind === 'heartbeat'
					? event.timestamp
					: job.snapshot.lastHeartbeatAt,
			lastSeq: event.seq,
			updatedAt: event.timestamp,
			warningCount:
				event.kind === 'warning'
					? job.snapshot.warningCount + 1
					: job.snapshot.warningCount,
		});

		job.writeQueue = job.writeQueue.then(async () => {
			await appendImportJobEvent(jobId, event);
			await writeImportJobSnapshot(job.snapshot);
		});
		await job.writeQueue;

		for (const subscriber of job.subscribers) {
			subscriber(event);
		}
		return event;
	}

	private async patchSnapshot(
		jobId: string,
		patch: Partial<ImportJobSnapshot>,
	): Promise<void> {
		const job = this.jobs.get(jobId);
		if (!job) return;
		job.snapshot = ImportJobSnapshotSchema.parse({
			...job.snapshot,
			...patch,
			updatedAt: now(),
		});
		job.writeQueue = job.writeQueue.then(async () => {
			await writeImportJobSnapshot(job.snapshot);
		});
		await job.writeQueue;
	}
}
