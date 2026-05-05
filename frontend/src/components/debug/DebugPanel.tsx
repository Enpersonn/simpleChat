import { useState } from 'preact/hooks';
import type { DebugInfo } from '../../lib/stream.js';
import { useChatsStore } from '../../store/chats.js';
import { useDebugStore } from '../../store/debug.js';
import { ContextGraph } from './ContextGraph.js';
import { FlowTimeline } from './FlowTimeline.js';

export function DebugPanel() {
	const activeTab = useDebugStore((st) => st.activeTab);
	const setTab = useDebugStore((st) => st.setTab);
	const events = useDebugStore((st) => st.events);
	const snapshot = useDebugStore((st) => st.snapshot);
	const debugInfo = useChatsStore((st) => st.debugInfo);

	return (
		<div class="mt-2 flex flex-col">
			<div class="flex border-border border-b">
				<button
					class="flex-1 cursor-pointer border-transparent border-b-2 bg-transparent px-1 py-[5px] font-medium text-[11px] text-text-muted tracking-[0.02em] transition-[color,border-color] duration-150 hover:text-text-primary data-[active=true]:border-accent data-[active=true]:text-accent"
					data-active={activeTab === 'flow' ? 'true' : undefined}
					onClick={() => setTab('flow')}
				>
					Flow
				</button>
				<button
					class="flex-1 cursor-pointer border-transparent border-b-2 bg-transparent px-1 py-[5px] font-medium text-[11px] text-text-muted tracking-[0.02em] transition-[color,border-color] duration-150 hover:text-text-primary data-[active=true]:border-accent data-[active=true]:text-accent"
					data-active={activeTab === 'graph' ? 'true' : undefined}
					onClick={() => setTab('graph')}
				>
					Graph
				</button>
				<button
					class="flex-1 cursor-pointer border-transparent border-b-2 bg-transparent px-1 py-[5px] font-medium text-[11px] text-text-muted tracking-[0.02em] transition-[color,border-color] duration-150 hover:text-text-primary data-[active=true]:border-accent data-[active=true]:text-accent"
					data-active={activeTab === 'prompt' ? 'true' : undefined}
					onClick={() => setTab('prompt')}
				>
					Prompt
				</button>
			</div>
			<div class="min-h-[40px] pt-2">
				{activeTab === 'flow' && (
					<FlowTimeline events={events} snapshot={snapshot} />
				)}
				{activeTab === 'graph' && <ContextGraph snapshot={snapshot} />}
				{activeTab === 'prompt' && <PromptView debugInfo={debugInfo} />}
			</div>
		</div>
	);
}

function PromptView({ debugInfo }: { debugInfo: DebugInfo | null }) {
	const [copied, setCopied] = useState(false);

	const copy = () => {
		if (!debugInfo) return;
		navigator.clipboard.writeText(debugInfo.systemPrompt);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	return (
		<div>
			{debugInfo ? (
				<>
					<div class="mb-1.5 flex items-center justify-between">
						<span class="font-medium text-sm text-text-muted uppercase tracking-[0.05em]">
							Model
						</span>
						<span class="text-[11px] text-text-primary">
							{debugInfo.model}
						</span>
					</div>
					<div class="mb-1 flex items-center justify-between">
						<span class="font-medium text-sm text-text-muted uppercase tracking-[0.05em]">
							System Prompt
						</span>
						<button
							class="cursor-pointer rounded-[3px] border border-border bg-bg-hover px-1.5 py-0.5 text-sm text-text-muted hover:text-text-primary"
							onClick={copy}
						>
							{copied ? '✓ Copied' : 'Copy'}
						</button>
					</div>
					<pre class="m-0 max-h-[400px] overflow-y-auto whitespace-pre-wrap break-words rounded border border-border bg-bg-secondary px-2 py-2 text-sm text-text-secondary leading-[1.5]">
						{debugInfo.systemPrompt}
					</pre>
				</>
			) : (
				<div class="py-4 text-center text-[11px] text-text-muted">
					Send a message to see the system prompt
				</div>
			)}
		</div>
	);
}
