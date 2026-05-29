import type { FastifyInstance } from 'fastify';
import { allowedOrigins } from '../config.js';
import { handleLLMError } from '../error-handlers.js';
import {
	type GenerateContext,
	type GenerationType,
	generateList,
	generateSingle,
} from '../LLM/generation/service.js';
import { parseStoryMultiPass } from '../LLM/parsing/pipeline.js';
import {
	type ParseContext,
	type ParseType,
	parseEntities,
} from '../LLM/parsing/service.js';
import { writeStreamEvent } from '../stream-events.js';

export async function aiRoutes(app: FastifyInstance): Promise<void> {
	app.post('/ai/generate', async (req, reply) => {
		const { type, concept, context, count } = req.body as {
			type?: GenerationType;
			concept?: string;
			context?: GenerateContext;
			count?: number;
		};

		if (!type) return reply.status(400).send({ error: 'type is required' });
		if (!concept?.trim())
			return reply.status(400).send({ error: 'concept is required' });

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
		if (!text?.trim())
			return reply.status(400).send({ error: 'text is required' });

		try {
			return await parseEntities(type, text.trim(), context);
		} catch (err) {
			return handleLLMError(err, reply);
		}
	});

	app.post('/ai/parse-stream', async (req, reply) => {
		const { text, context } = req.body as {
			text?: string;
			context?: ParseContext;
		};

		if (!text?.trim()) {
			return reply.status(400).send({ error: 'text is required' });
		}

		const origin = (req.headers.origin as string) ?? '';
		const corsOrigin = allowedOrigins.includes(origin)
			? origin
			: allowedOrigins[0];

		reply.raw.writeHead(200, {
			'Access-Control-Allow-Origin': corsOrigin,
			'Cache-Control': 'no-cache',
			'Content-Type': 'application/x-ndjson',
			'Transfer-Encoding': 'chunked',
			'X-Accel-Buffering': 'no',
		});

		try {
			const result = await parseStoryMultiPass(
				text.trim(),
				context,
				(stage, status, data) => {
					writeStreamEvent(reply.raw, {
						channel: 'parse_stage',
						data: { data, stage, status },
						name: stage,
						status,
						type: 'progress',
					});
					if (status !== 'complete' || !data) return;
					if (stage === 'story.core+locations') {
						writeStreamEvent(reply.raw, {
							channel: 'parse_partial',
							data: { data: data.storyCore, type: 'storyCore' },
							name: 'storyCore',
							status: 'complete',
							type: 'progress',
						});
						writeStreamEvent(reply.raw, {
							channel: 'parse_partial',
							data: { data: data.locations, type: 'locations' },
							name: 'locations',
							status: 'complete',
							type: 'progress',
						});
					} else if (stage === 'story.characters') {
						writeStreamEvent(reply.raw, {
							channel: 'parse_partial',
							data: { data: data.characters, type: 'characters' },
							name: 'characters',
							status: 'complete',
							type: 'progress',
						});
					} else if (stage === 'story.memories') {
						writeStreamEvent(reply.raw, {
							channel: 'parse_partial',
							data: { data: data.memories, type: 'memories' },
							name: 'memories',
							status: 'complete',
							type: 'progress',
						});
					}
				},
				(event) => {
					writeStreamEvent(reply.raw, {
						data: event,
						name: 'parse_verbose',
						type: 'debug',
					});
				},
			);

			writeStreamEvent(reply.raw, { result, type: 'done' });
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Parse error';
			writeStreamEvent(reply.raw, { message, type: 'error' });
		}

		reply.raw.end();
	});
}
