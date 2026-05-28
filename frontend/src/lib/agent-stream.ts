import type { PipelineEvent } from './debug-types.js';

export interface AgentActivity {
	id: string;
	toolName: string;
	args: unknown;
	result?: unknown;
	status: 'pending' | 'complete';
	startedAt: number;
	completedAt?: number;
}

export interface StreamPhase {
	step: string;
	label: string;
	status: 'running' | 'complete' | 'error';
	durationMs?: number;
}

export const CHAT_PHASE_LABELS: Record<string, string> = {
	memory_chain: 'Loading memories…',
	memory_retrieval: 'Finding relevant context…',
	context_assembly: 'Preparing context…',
	llm_call: 'Generating…',
	persist_result: 'Saving…',
	extraction: 'Updating world state…',
};

export function resolveCurrentPhase(
	events: PipelineEvent[],
): StreamPhase | null {
	if (events.length === 0) return null;

	// Find the most recently started step that hasn't completed yet (running)
	const steps = new Map<
		string,
		{ start?: PipelineEvent; terminal?: PipelineEvent }
	>();
	for (const e of events) {
		const entry = steps.get(e.step) ?? {};
		if (e.status === 'start') entry.start = e;
		else entry.terminal = e;
		steps.set(e.step, entry);
	}

	// Prefer the step that is currently running (started but not finished)
	for (const [step, entry] of [...steps.entries()].reverse()) {
		if (entry.start && !entry.terminal) {
			return {
				step,
				label: CHAT_PHASE_LABELS[step] ?? step,
				status: 'running',
			};
		}
	}

	// All steps finished — return the last terminal event's step
	const last = events[events.length - 1];
	return {
		step: last.step,
		label: CHAT_PHASE_LABELS[last.step] ?? last.step,
		status: last.status === 'error' ? 'error' : 'complete',
		durationMs: last.status !== 'start' ? last.durationMs : undefined,
	};
}

export function mergeToolResult(
	activities: AgentActivity[],
	toolName: string,
	result: unknown,
): AgentActivity[] {
	// Complete the most recent pending activity for this tool name
	const idx = [...activities]
		.reverse()
		.findIndex((a) => a.toolName === toolName && a.status === 'pending');
	if (idx === -1) return activities;
	const realIdx = activities.length - 1 - idx;
	return activities.map((a, i) =>
		i === realIdx
			? { ...a, result, status: 'complete', completedAt: Date.now() }
			: a,
	);
}
