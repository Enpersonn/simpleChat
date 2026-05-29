import {
	appendFile,
	mkdir,
	readdir,
	readFile,
	rm,
	writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import {
	type ImportJobEvent,
	ImportJobEventSchema,
	type ImportJobSnapshot,
	ImportJobSnapshotSchema,
	type ImportJobSummary,
	ImportJobSummarySchema,
} from '@simplechat/types';
import { dataDir } from '../../config.js';

const RETAIN_COUNT = 20;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

async function importJobsDir(): Promise<string> {
	return join(await dataDir(), 'import-jobs');
}

export async function deleteImportJob(jobId: string): Promise<void> {
	const root = await importJobsDir();
	await rm(jobDir(root, jobId), { force: true, recursive: true });
}

export async function clearImportJobs(): Promise<void> {
	const root = await importJobsDir();
	await rm(root, { force: true, recursive: true });
}

function jobDir(root: string, jobId: string): string {
	return join(root, jobId);
}

function snapshotPath(root: string, jobId: string): string {
	return join(jobDir(root, jobId), 'snapshot.json');
}

function eventsPath(root: string, jobId: string): string {
	return join(jobDir(root, jobId), 'events.jsonl');
}

export async function ensureImportJobDir(jobId: string): Promise<void> {
	const root = await importJobsDir();
	await mkdir(jobDir(root, jobId), { recursive: true });
}

export async function readImportJobSnapshot(
	jobId: string,
): Promise<ImportJobSnapshot | null> {
	try {
		const root = await importJobsDir();
		const raw = await readFile(snapshotPath(root, jobId), 'utf-8');
		return ImportJobSnapshotSchema.parse(JSON.parse(raw));
	} catch {
		return null;
	}
}

export async function writeImportJobSnapshot(
	snapshot: ImportJobSnapshot,
): Promise<void> {
	const root = await importJobsDir();
	await mkdir(jobDir(root, snapshot.jobId), { recursive: true });
	await writeFile(
		snapshotPath(root, snapshot.jobId),
		JSON.stringify(snapshot, null, 2),
	);
}

export async function appendImportJobEvent(
	jobId: string,
	event: ImportJobEvent,
): Promise<void> {
	const root = await importJobsDir();
	await mkdir(jobDir(root, jobId), { recursive: true });
	await appendFile(
		eventsPath(root, jobId),
		`${JSON.stringify(event)}\n`,
		'utf-8',
	);
}

export async function readImportJobEventsAfter(
	jobId: string,
	afterSeq: number,
): Promise<ImportJobEvent[]> {
	try {
		const root = await importJobsDir();
		const raw = await readFile(eventsPath(root, jobId), 'utf-8');
		return raw
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => ImportJobEventSchema.safeParse(JSON.parse(line)))
			.filter((parsed) => parsed.success)
			.map((parsed) => parsed.data)
			.filter((event) => event.seq > afterSeq);
	} catch {
		return [];
	}
}

export async function listRecentImportJobs(): Promise<ImportJobSummary[]> {
	try {
		const root = await importJobsDir();
		const entries = await readdir(root, { withFileTypes: true });
		const snapshots = await Promise.all(
			entries
				.filter((entry) => entry.isDirectory())
				.map(async (entry) => readImportJobSnapshot(entry.name)),
		);

		return snapshots
			.filter((snapshot): snapshot is ImportJobSnapshot => snapshot !== null)
			.map((snapshot) => ImportJobSummarySchema.parse(snapshot))
			.sort((a: ImportJobSummary, b: ImportJobSummary) =>
				b.updatedAt.localeCompare(a.updatedAt),
			)
			.slice(0, RETAIN_COUNT);
	} catch {
		return [];
	}
}

export async function pruneImportJobs(): Promise<void> {
	try {
		const root = await importJobsDir();
		const jobs = await listRecentImportJobs();
		const keep = new Set(jobs.slice(0, RETAIN_COUNT).map((job) => job.jobId));
		const nowTs = Date.now();
		const entries = await readdir(root, { withFileTypes: true });

		await Promise.all(
			entries
				.filter((entry) => entry.isDirectory())
				.map(async (entry) => {
					const snapshot: ImportJobSnapshot | null =
						await readImportJobSnapshot(entry.name);
					if (!snapshot) return;

					const ageMs =
						nowTs - new Date(snapshot.updatedAt).getTime();
					if (keep.has(snapshot.jobId) && ageMs <= MAX_AGE_MS) return;

					await rm(jobDir(root, entry.name), {
						force: true,
						recursive: true,
					});
				}),
		);
	} catch {
		// best-effort pruning
	}
}
