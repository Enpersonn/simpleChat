import { useState } from 'preact/hooks'
import { useDebugStore } from '../../store/debug.js'
import { useChatsStore } from '../../store/chats.js'
import type { DebugInfo } from '../../lib/stream.js'
import { FlowTimeline } from './FlowTimeline.js'
import { ContextGraph } from './ContextGraph.js'

export function DebugPanel() {
  const activeTab = useDebugStore((st) => st.activeTab)
  const setTab = useDebugStore((st) => st.setTab)
  const events = useDebugStore((st) => st.events)
  const snapshot = useDebugStore((st) => st.snapshot)
  const debugInfo = useChatsStore((st) => st.debugInfo)

  return (
    <div class="flex flex-col mt-2">
      <div class="flex border-b border-border">
        <button
          class="flex-1 py-[5px] px-1 bg-transparent border-b-2 border-transparent text-text-muted text-[11px] font-medium cursor-pointer transition-[color,border-color] duration-150 tracking-[0.02em] hover:text-text-primary data-[active=true]:text-accent data-[active=true]:border-accent"
          data-active={activeTab === 'flow' ? 'true' : undefined}
          onClick={() => setTab('flow')}
        >
          Flow
        </button>
        <button
          class="flex-1 py-[5px] px-1 bg-transparent border-b-2 border-transparent text-text-muted text-[11px] font-medium cursor-pointer transition-[color,border-color] duration-150 tracking-[0.02em] hover:text-text-primary data-[active=true]:text-accent data-[active=true]:border-accent"
          data-active={activeTab === 'graph' ? 'true' : undefined}
          onClick={() => setTab('graph')}
        >
          Graph
        </button>
        <button
          class="flex-1 py-[5px] px-1 bg-transparent border-b-2 border-transparent text-text-muted text-[11px] font-medium cursor-pointer transition-[color,border-color] duration-150 tracking-[0.02em] hover:text-text-primary data-[active=true]:text-accent data-[active=true]:border-accent"
          data-active={activeTab === 'prompt' ? 'true' : undefined}
          onClick={() => setTab('prompt')}
        >
          Prompt
        </button>
      </div>
      <div class="pt-2 min-h-[40px]">
        {activeTab === 'flow' && (
          <FlowTimeline events={events} snapshot={snapshot} />
        )}
        {activeTab === 'graph' && (
          <ContextGraph snapshot={snapshot} />
        )}
        {activeTab === 'prompt' && (
          <PromptView debugInfo={debugInfo} />
        )}
      </div>
    </div>
  )
}

function PromptView({ debugInfo }: { debugInfo: DebugInfo | null }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    if (!debugInfo) return
    navigator.clipboard.writeText(debugInfo.systemPrompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div>
      {debugInfo ? (
        <>
          <div class="flex justify-between items-center mb-1.5">
            <span class="text-[10px] text-text-muted font-medium tracking-[0.05em] uppercase">
              Model
            </span>
            <span class="text-[11px] text-text-primary">{debugInfo.model}</span>
          </div>
          <div class="flex justify-between items-center mb-1">
            <span class="text-[10px] text-text-muted font-medium tracking-[0.05em] uppercase">
              System Prompt
            </span>
            <button
              class="text-[10px] px-1.5 py-0.5 bg-bg-hover border border-border rounded-[3px] text-text-muted cursor-pointer hover:text-text-primary"
              onClick={copy}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <pre class="text-[10px] leading-[1.5] whitespace-pre-wrap break-words bg-bg-secondary border border-border rounded px-2 py-2 max-h-[400px] overflow-y-auto text-text-secondary m-0">
            {debugInfo.systemPrompt}
          </pre>
        </>
      ) : (
        <div class="text-[11px] text-text-muted text-center py-4">
          Send a message to see the system prompt
        </div>
      )}
    </div>
  )
}
