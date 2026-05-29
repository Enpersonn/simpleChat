import type { ServerResponse } from 'node:http';
import type { ImportJobEvent } from '@simplechat/types';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { allowedOrigins } from '../config.js';
import { handleLLMError } from '../error-handlers.js';
import { importJobManager } from '../features/import-jobs/index.js';
import {
	type GenerateContext,
	type GenerationType,
	generateList,
	generateSingle,
} from '../LLM/generation/service.js';
import {
	type ParseContext,
	type ParseType,
	parseEntities,
} from '../LLM/parsing/service.js';

function writeNdjson(raw: ServerResponse, payload: unknown): void {
	raw.write(`${JSON.stringify(payload)}\n`);
}

function applyStreamingHeaders(
	reply: FastifyReply,
	origin: string | undefined,
): void {
	const corsOrigin = allowedOrigins.includes(origin ?? '')
		? (origin ?? '')
		: allowedOrigins[0];

	reply.raw.writeHead(200, {
		'Access-Control-Allow-Origin': corsOrigin,
		'Cache-Control': 'no-cache',
		'Content-Type': 'application/x-ndjson',
		'Transfer-Encoding': 'chunked',
		'X-Accel-Buffering': 'no',
	});
}

function isTerminalStatus(status: string): boolean {
	return (
		status === 'completed' ||
		status === 'failed' ||
		status === 'cancelled'
	);
}

function isTerminalEvent(event: ImportJobEvent): boolean {
	return (
		event.kind === 'job_completed' ||
		event.kind === 'job_failed' ||
		event.kind === 'job_cancelled'
	);
}

async function tailImportJobEvents(
	req: FastifyRequest,
	reply: FastifyReply,
	jobId: string,
	afterSeq: number,
): Promise<void> {
	const snapshot = await importJobManager.getSnapshot(jobId);
	if (!snapshot) {
		reply.status(404).send({ error: 'Import job not found' });
		return;
	}

	applyStreamingHeaders(reply, req.headers.origin as string | undefined);

	let closed = false;
	let buffering = true;
	let lastSentSeq = afterSeq;
	const liveBuffer: ImportJobEvent[] = [];

	const writeEvent = (event: ImportJobEvent) => {
		if (closed || event.seq <= lastSentSeq) return;
		lastSentSeq = event.seq;
		writeNdjson(reply.raw, event);
		if (isTerminalEvent(event)) {
			closed = true;
			reply.raw.end();
		}
	};

	const unsubscribe = importJobManager.addSubscriber(jobId, (event) => {
		if (buffering) {
			liveBuffer.push(event);
			return;
		}
		writeEvent(event);
	});

	req.raw.on('close', () => {
		if (closed) return;
		closed = true;
		unsubscribe();
	});

	const backlog = await importJobManager.getEventsAfter(jobId, afterSeq);
	backlog.forEach(writeEvent);

	buffering = false;
	liveBuffer.sort((a, b) => a.seq - b.seq).forEach(writeEvent);

	if (closed) {
		unsubscribe();
		return;
	}

	const latestSnapshot = await importJobManager.getSnapshot(jobId);
	if (
		latestSnapshot &&
		(isTerminalStatus(latestSnapshot.status) ||
			!importJobManager.hasLiveJob(jobId))
	) {
		closed = true;
		reply.raw.end();
		unsubscribe();
	}
}

export async function aiRoutes(app: FastifyInstance): Promise<void> {
	app.post('/ai/generate', async (req, reply) => {
		const { type, concept, context, count } = req.body as {
			type?: GenerationType;
			concept?: string;
			context?: GenerateContext;
			count?: number;
		};

		if (!type) return reply.status(400).send({ error: 'type is required' });
		if (!concept?.trim()) {
			return reply.status(400).send({ error: 'concept is required' });
		}

		try {
			if (count && count > 1) {
				const items = await generateList(
					type,
					concept.trim(),
					count,
					context,
				);
				return { items };
			}
			return await generateSingle(type, concept.trim(), context);
		} catch (err) {
			return handleLLMError(err, reply);
		}
	});

	app.post('/ai/parse', async (req, reply) => {
		const { type, text, context } = req.body as {
			type?: ParseType;
			text?: string;
			context?: ParseContext;
		};

		if (!type) return reply.status(400).send({ error: 'type is required' });
		if (!text?.trim()) {
			return reply.status(400).send({ error: 'text is required' });
		}

		try {
			return await parseEntities(type, text.trim(), context);
		} catch (err) {
			return handleLLMError(err, reply);
		}
	});

	app.post('/ai/import-jobs', async (req, reply) => {
		const { text, context } = req.body as {
			text?: string;
			context?: ParseContext;
		};

		if (!text?.trim()) {
			return reply.status(400).send({ error: 'text is required' });
		}

		const snapshot = await importJobManager.createJob({
			context,
			sourceText: text.trim(),
		});
		return { jobId: snapshot.jobId };
	});

	app.get('/ai/import-jobs/recent', async () => {
		return importJobManager.getRecentJobs();
	});

	app.delete('/ai/import-jobs', async () => {
		await importJobManager.clearAllJobs();
		return { ok: true };
	});

	app.get<{ Params: { jobId: string } }>(
		'/ai/import-jobs/:jobId',
		async (req, reply) => {
			const snapshot = await importJobManager.getSnapshot(
				req.params.jobId,
			);
			if (!snapshot) {
				return reply
					.status(404)
					.send({ error: 'Import job not found' });
			}
			return snapshot;
		},
	);

	app.post<{ Params: { jobId: string } }>(
		'/ai/import-jobs/:jobId/cancel',
		async (req, reply) => {
			const snapshot = await importJobManager.cancelJob(req.params.jobId);
			if (!snapshot) {
				return reply
					.status(404)
					.send({ error: 'Import job not found' });
			}
			return snapshot;
		},
	);

	app.delete<{ Params: { jobId: string } }>(
		'/ai/import-jobs/:jobId',
		async (req) => {
			await importJobManager.deleteJob(req.params.jobId);
			return { ok: true };
		},
	);

	app.get<{
		Params: { jobId: string };
		Querystring: { after?: string };
	}>('/ai/import-jobs/:jobId/events', async (req, reply) => {
		const afterSeq = Number.parseInt(req.query.after ?? '0', 10);
		await tailImportJobEvents(
			req,
			reply,
			req.params.jobId,
			Number.isFinite(afterSeq) ? afterSeq : 0,
		);
		return reply;
	});

	app.post('/ai/parse-stream', async (req, reply) => {
		const { text, context } = req.body as {
			text?: string;
			context?: ParseContext;
		};

		if (!text?.trim()) {
			return reply.status(400).send({ error: 'text is required' });
		}

		try {
			const snapshot = await importJobManager.createJob({
				context,
				sourceText: text.trim(),
			});
			await tailImportJobEvents(req, reply, snapshot.jobId, 0);
			return reply;
		} catch (err) {
			applyStreamingHeaders(reply, req.headers.origin as string | undefined);
			writeNdjson(reply.raw, {
				error: err instanceof Error ? err.message : 'Parse error',
			});
			reply.raw.end();
			return reply;
		}
	});
}
