import { useState } from 'preact/hooks'
import { useDebugStore } from '../../store/debug.js'
import { useChatsStore } from '../../store/chats.js'
import type { DebugInfo } from '../../lib/stream.js'
import { FlowTimeline } from './FlowTimeline.js'
import { ContextGraph } from './ContextGraph.js'
import s from './DebugPanel.module.css'

export function DebugPanel() {
  const activeTab = useDebugStore((st) => st.activeTab)
  const setTab = useDebugStore((st) => st.setTab)
  const events = useDebugStore((st) => st.events)
  const snapshot = useDebugStore((st) => st.snapshot)
  const debugInfo = useChatsStore((st) => st.debugInfo)

  return (
    <div class={s.root}>
      <div class={s.tabs}>
        <button
          class={s.tab}
          data-active={activeTab === 'flow' ? 'true' : undefined}
          onClick={() => setTab('flow')}
        >
          Flow
        </button>
        <button
          class={s.tab}
          data-active={activeTab === 'graph' ? 'true' : undefined}
          onClick={() => setTab('graph')}
        >
          Graph
        </button>
        <button
          class={s.tab}
          data-active={activeTab === 'prompt' ? 'true' : undefined}
          onClick={() => setTab('prompt')}
        >
          Prompt
        </button>
      </div>
      <div class={s.body}>
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
          <div class={s.promptRow}>
            <span class={s.promptKey}>Model</span>
            <span class={s.promptVal}>{debugInfo.model}</span>
          </div>
          <div class={s.promptHeader}>
            <span class={s.promptKey}>System Prompt</span>
            <button class={s.copyBtn} onClick={copy}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <pre class={s.promptPre}>{debugInfo.systemPrompt}</pre>
        </>
      ) : (
        <div class={s.promptEmpty}>Send a message to see the system prompt</div>
      )}
    </div>
  )
}
