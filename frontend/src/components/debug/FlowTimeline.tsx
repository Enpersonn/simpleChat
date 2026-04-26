import { useState } from 'preact/hooks'
import type {
  PipelineEvent,
  PipelineStep,
  ContextSnapshot,
  DataLoadData,
  MemoryChainData,
  MemoryRetrievalData,
  ContextAssemblyData,
  LlmCallData,
  ExtractionData,
} from '../../lib/debug-types.js'
import s from './FlowTimeline.module.css'

const STEP_ORDER: PipelineStep[] = [
  'data_load',
  'memory_chain',
  'memory_retrieval',
  'context_assembly',
  'llm_call',
  'extraction',
]

const STEP_LABELS: Record<PipelineStep, string> = {
  data_load: 'Data Load',
  memory_chain: 'Memory Chain',
  memory_retrieval: 'Memory Retrieval',
  context_assembly: 'Context Assembly',
  llm_call: 'LLM Call',
  extraction: 'Extraction',
}

interface Props {
  events: PipelineEvent[]
  snapshot: ContextSnapshot | null
}

export function FlowTimeline({ events, snapshot }: Props) {
  const [expanded, setExpanded] = useState<Set<PipelineStep>>(new Set())

  if (events.length === 0) {
    return <div class={s.empty}>Send a message to see the pipeline flow</div>
  }

  const byStep = new Map<PipelineStep, { start?: PipelineEvent; terminal?: PipelineEvent }>()
  for (const e of events) {
    const entry = byStep.get(e.step) ?? {}
    if (e.status === 'start') entry.start = e
    else entry.terminal = e
    byStep.set(e.step, entry)
  }

  const toggle = (step: PipelineStep) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(step)) next.delete(step)
      else next.add(step)
      return next
    })
  }

  return (
    <div class={s.root}>
      {STEP_ORDER.map((step) => {
        const entry = byStep.get(step)
        if (!entry) return null
        const { start, terminal } = entry
        const isOpen = expanded.has(step)
        const status = terminal
          ? terminal.status
          : start
          ? 'running'
          : 'pending'
        const hasData = terminal?.data !== undefined
        const canExpand = terminal?.status === 'complete' && hasData

        return (
          <div key={step} class={s.step}>
            <div
              class={s.stepHeader}
              data-open={isOpen ? 'true' : undefined}
              onClick={() => canExpand && toggle(step)}
              style={{ cursor: canExpand ? 'pointer' : 'default' }}
            >
              <span class={s.dot} data-status={status} />
              <span class={s.stepLabel}>{STEP_LABELS[step]}</span>
              {terminal?.durationMs !== undefined && (
                <span class={s.duration}>{terminal.durationMs}ms</span>
              )}
              {canExpand && (
                <span class={s.chevron} data-open={isOpen ? 'true' : undefined}>▾</span>
              )}
            </div>
            {isOpen && terminal?.data && (
              <div class={s.stepBody}>
                <StepData step={step} data={terminal.data} snapshot={snapshot} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function StepData({
  step,
  data,
  snapshot,
}: {
  step: PipelineStep
  data: object
  snapshot: ContextSnapshot | null
}) {
  if (step === 'data_load') {
    const d = data as DataLoadData
    return (
      <div class={s.statRow}>
        <div class={s.stat}>
          <span class={s.statNum}>{d.characterCount}</span>
          <span class={s.statLabel}>Chars</span>
        </div>
        <div class={s.stat}>
          <span class={s.statNum}>{d.locationCount}</span>
          <span class={s.statLabel}>Locations</span>
        </div>
        <div class={s.stat}>
          <span class={s.statNum}>{d.turnCount}</span>
          <span class={s.statLabel}>Turns</span>
        </div>
      </div>
    )
  }

  if (step === 'memory_chain') {
    const d = data as MemoryChainData
    if (d.chains.length === 0) return <span class={s.noResults}>No characters</span>
    return (
      <table class={s.chainTable}>
        <tbody>
          {d.chains.map((c) => {
            const diff = c.effectiveDiff
            const hasDiff =
              diff.personalityAdded.length > 0 ||
              diff.personalityRemoved.length > 0 ||
              diff.fearsAdded.length > 0 ||
              diff.speechStyleChanged ||
              diff.trueMotivestChanged ||
              diff.hiddenEmotionalStateChanged
            const diffParts: string[] = []
            if (diff.personalityAdded.length > 0)
              diffParts.push(`+${diff.personalityAdded.slice(0, 2).join(', ')}`)
            if (diff.personalityRemoved.length > 0)
              diffParts.push(`−${diff.personalityRemoved.slice(0, 2).join(', ')}`)
            if (diff.fearsAdded.length > 0)
              diffParts.push(`fear+${diff.fearsAdded[0]}`)
            if (diff.speechStyleChanged) diffParts.push('speech ✓')
            if (diff.trueMotivestChanged) diffParts.push('motives ✓')
            if (diff.hiddenEmotionalStateChanged) diffParts.push('emotion ✓')

            return (
              <tr key={c.characterId}>
                <td class={s.chainName}>{c.characterName}</td>
                <td class={s.chainLen}>{c.chainLength} mem</td>
                <td class={s.chainDiff}>
                  {hasDiff ? (
                    diffParts.map((p, i) => (
                      <span
                        key={i}
                        class={
                          p.startsWith('+') ? s.diffAdd :
                          p.startsWith('−') ? s.diffRemove :
                          s.diffChanged
                        }
                      >
                        {p}{i < diffParts.length - 1 ? ' · ' : ''}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>no delta</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    )
  }

  if (step === 'memory_retrieval') {
    const d = data as MemoryRetrievalData
    const memMap = new Map(
      snapshot?.accessibleMemories.map((m) => [m.id, m.summary]) ?? [],
    )
    return (
      <div>
        <div style={{ marginBottom: '4px', color: 'var(--text-muted)', fontSize: '9px' }}>
          {d.results.length} of {d.accessibleCount} accessible memories injected
        </div>
        {d.results.length === 0 ? (
          <span class={s.noResults}>No memories retrieved</span>
        ) : (
          <div class={s.memPills}>
            {d.results.map((r) => {
              const summary = memMap.get(r.memoryId) ?? r.summary
              const reasonLabel =
                r.reason === 'always_include' ? 'Always' :
                r.reason === 'tag_match' ? `Tag (${r.score ?? 1})` :
                'LLM picked'
              return (
                <div key={r.memoryId} class={s.memPill} data-reason={r.reason} title={summary}>
                  <span class={s.memPillSummary}>{summary.slice(0, 40)}{summary.length > 40 ? '…' : ''}</span>
                  <span class={s.memPillReason}>{reasonLabel}</span>
                </div>
              )
            })}
          </div>
        )}
        {d.llmFallbackFired && (
          <div class={s.llmBanner}>LLM fallback fired</div>
        )}
      </div>
    )
  }

  if (step === 'context_assembly') {
    const d = data as ContextAssemblyData
    const locLabel = d.currentLocationId ? 'Active' : 'None'
    return (
      <div class={s.kv}>
        <div class={s.kvRow}>
          <span class={s.kvKey}>Prompt length</span>
          <span class={s.kvVal}>{d.systemPromptLength.toLocaleString()} chars</span>
        </div>
        <div class={s.kvRow}>
          <span class={s.kvKey}>Memories injected</span>
          <span class={s.kvVal}>{d.injectedMemoryIds.length}</span>
        </div>
        <div class={s.kvRow}>
          <span class={s.kvKey}>Location</span>
          <span class={s.kvVal}>{locLabel}</span>
        </div>
        <div class={s.kvRow}>
          <span class={s.kvKey}>Mood tags</span>
          <span class={s.kvVal}>{d.moodTagCount}</span>
        </div>
      </div>
    )
  }

  if (step === 'llm_call') {
    const d = data as LlmCallData
    return (
      <div class={s.kv}>
        <div class={s.kvRow}>
          <span class={s.kvKey}>Model</span>
          <span class={s.kvVal}>{d.model}</span>
        </div>
        <div class={s.kvRow}>
          <span class={s.kvKey}>~Tokens out</span>
          <span class={s.kvVal}>{d.tokenCount.toLocaleString()}</span>
        </div>
        <div class={s.kvRow}>
          <span class={s.kvKey}>Duration</span>
          <span class={s.kvVal}>{d.durationMs.toLocaleString()}ms</span>
        </div>
      </div>
    )
  }

  if (step === 'extraction') {
    const d = data as ExtractionData
    return (
      <div class={s.extractResult}>
        <div class={s.kvRow}>
          <span class={s.kvKey}>Location changed</span>
          <span class={s.extractBadge} data-ok={d.locationChanged ? 'true' : 'false'}>
            {d.locationChanged ? 'Yes' : 'No'}
          </span>
        </div>
        {d.newLocationCreated && (
          <div class={s.kvRow}>
            <span class={s.kvKey}>New location</span>
            <span class={s.kvVal}>{d.newLocationName ?? '?'}</span>
          </div>
        )}
        <div class={s.kvRow}>
          <span class={s.kvKey}>Overrides changed</span>
          <span class={s.extractBadge} data-ok={d.overridesChanged ? 'true' : 'false'}>
            {d.overridesChanged ? 'Yes' : 'No'}
          </span>
        </div>
        {(d.locationChanged || d.newLocationCreated) && d.newLocationId && (
          <div class={s.kvRow}>
            <span class={s.kvKey}>New location ID</span>
            <span class={s.kvVal} style={{ fontSize: '9px' }}>{d.newLocationId}</span>
          </div>
        )}
      </div>
    )
  }

  return null
}
