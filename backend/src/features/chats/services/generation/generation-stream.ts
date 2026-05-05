import type { FastifyReply, FastifyRequest } from 'fastify';
import { allowedOrigins } from '../../../../config';
import { emitFrame, emitPipeline } from '../../helpers';

export function createGenerationStream(
	req: FastifyRequest,
	reply: FastifyReply,
) {
	const origin = req.headers.origin ?? '';
	const corsOrigin = allowedOrigins.includes(origin)
		? origin
		: allowedOrigins[0];

	reply.raw.writeHead(200, {
		'Content-Type': 'application/x-ndjson',
		'Transfer-Encoding': 'chunked',
		'Cache-Control': 'no-cache',
		'X-Accel-Buffering': 'no',
		'Access-Control-Allow-Origin': corsOrigin,
	});

	return {
		frame(payload: unknown) {
			reply.raw.write(`${JSON.stringify(payload)}\n`);
		},

		pipeline(
			name: string,
			status: 'start' | 'complete' | 'error',
			startedAt?: number,
			payload?: object,
		) {
			emitPipeline(reply.raw, name, status, startedAt, payload);
		},

		content(chunk: string) {
			reply.raw.write(`${JSON.stringify({ content: chunk })}\n`);
		},

		done() {
			emitFrame(reply.raw, { done: true });
			reply.raw.end();
		},

		error(error: unknown) {
			const message =
				error instanceof Error ? error.message : 'Generation error';
			emitFrame(reply.raw, { error: message });
			reply.raw.end();
		},
	};
}
