import type { ServerResponse } from 'node:http';

export type StreamEvent =
	| { type: 'content'; text: string }
	| {
			type: 'progress';
			channel?: string;
			name: string;
			status?: 'start' | 'complete' | 'error';
			data?: unknown;
	  }
	| {
			type: 'debug';
			name: string;
			data: unknown;
	  }
	| {
			type: 'tool_call';
			name: string;
			args: unknown;
	  }
	| {
			type: 'tool_result';
			name: string;
			output: unknown;
	  }
	| {
			type: 'skill_call';
			name: string;
			args: unknown;
	  }
	| {
			type: 'skill_result';
			name: string;
			output: unknown;
	  }
	| {
			type: 'handoff';
			from: string;
			to: string;
			message: string;
	  }
	| {
			type: 'error';
			message: string;
	  }
	| {
			type: 'done';
			result?: unknown;
	  };

export function writeStreamEvent(
	raw: ServerResponse,
	event: StreamEvent,
): void {
	raw.write(`${JSON.stringify({ event })}\n`);
}

