import type { FastifyReply, FastifyRequest } from 'fastify';
import { allowedOrigins } from '../../../../config.js';
import { writeStreamEvent } from '../../../../stream-events.js';
import { emitPipeline } from '../../helpers.js';

export function createGenerationStream(
	req: FastifyRequest,
	reply: FastifyReply,
) {
	const origin = req.headers.origin ?? '';
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

	return {
		content(chunk: string) {
			writeStreamEvent(reply.raw, { text: chunk, type: 'content' });
		},

		debug(name: string, data: unknown) {
			writeStreamEvent(reply.raw, { data, name, type: 'debug' });
		},

		done(result?: unknown) {
			writeStreamEvent(reply.raw, { result, type: 'done' });
			reply.raw.end();
		},

		error(error: unknown) {
			const message =
				error instanceof Error ? error.message : 'Generation error';
			writeStreamEvent(reply.raw, { message, type: 'error' });
			reply.raw.end();
		},

		handoff(payload: { from: string; to: string; message: string }) {
			writeStreamEvent(reply.raw, {
				from: payload.from,
				message: payload.message,
				to: payload.to,
				type: 'handoff',
			});
		},
		pipeline(
			name: string,
			status: 'start' | 'complete' | 'error',
			startedAt?: number,
			payload?: object,
		) {
			emitPipeline(reply.raw, name, status, startedAt, payload);
		},

		progress(
			name: string,
			status: 'start' | 'complete' | 'error',
			data?: unknown,
			channel?: string,
		) {
			writeStreamEvent(reply.raw, {
				channel,
				data,
				name,
				status,
				type: 'progress',
			});
		},

		proposals(proposals: unknown) {
			this.progress('proposals', 'complete', proposals, 'proposals');
		},

		skillCall(call: { name: string; args: unknown }) {
			writeStreamEvent(reply.raw, {
				args: call.args,
				name: call.name,
				type: 'skill_call',
			});
		},

		skillResult(result: { name: string; output: unknown }) {
			writeStreamEvent(reply.raw, {
				name: result.name,
				output: result.output,
				type: 'skill_result',
			});
		},

		stateUpdate(update: unknown) {
			this.progress('state_update', 'complete', update, 'state_update');
		},

		toolCall(call: { name: string; args: unknown }) {
			writeStreamEvent(reply.raw, {
				args: call.args,
				name: call.name,
				type: 'tool_call',
			});
		},

		toolResult(result: { name: string; output: unknown }) {
			writeStreamEvent(reply.raw, {
				name: result.name,
				output: result.output,
				type: 'tool_result',
			});
		},
	};
}
