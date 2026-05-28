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

		const emit = (frame: object) =>
			reply.raw.write(`${JSON.stringify(frame)}\n`);

		try {
			const result = await parseStoryMultiPass(
				text.trim(),
				context,
				(stage, status, data) => {
					emit({ parseProgress: { data, stage, status } });
					if (status !== 'complete' || !data) return;
					if (stage === 'story.core+locations') {
						emit({ parsePartial: { data: data.storyCore, type: 'storyCore' } });
						emit({ parsePartial: { data: data.locations, type: 'locations' } });
					} else if (stage === 'story.characters') {
						emit({ parsePartial: { data: data.characters, type: 'characters' } });
					} else if (stage === 'story.memories') {
						emit({ parsePartial: { data: data.memories, type: 'memories' } });
					}
				},
				(event) => {
					emit({ parseVerbose: event });
				},
			);

			emit({ done: true, result });
		} catch (err) {
			const message =
				err instanceof Error ? err.message : 'Parse error';
			emit({ error: message });
		}

		reply.raw.end();
	});
}
