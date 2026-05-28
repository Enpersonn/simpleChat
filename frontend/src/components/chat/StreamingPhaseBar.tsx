import type { AgentActivity, StreamPhase } from '../../lib/agent-stream.js';

interface Props {
	phase: StreamPhase | null;
	activities: AgentActivity[];
	isStreaming: boolean;
}

export function StreamingPhaseBar({ phase, activities, isStreaming }: Props) {
	if (!isStreaming || !phase || phase.status !== 'running') return null;

	const pendingTool = [...activities]
		.reverse()
		.find((a) => a.status === 'pending');

	return (
		<div class="flex items-center gap-1.5 px-0.5 pb-1.5 text-[11px] text-text-muted">
			<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-accent animate-pulse-dot" />
			<span class="truncate">
				{pendingTool ? `→ ${pendingTool.toolName}` : phase.label}
			</span>
		</div>
	);
}
