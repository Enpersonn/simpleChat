import { useState, useRef } from 'preact/hooks'
import type { MoodTag, ResponseLength } from '@simplechat/types'
import { useSettingsStore } from '../../store/settings.js'
import { useChatsStore } from '../../store/chats.js'
import { useStoriesStore } from '../../store/stories.js'
import s from './RightPanel.module.css'

const MOOD_TAGS: MoodTag[] = [
  'tense', 'warm', 'eerie', 'playful', 'melancholy',
  'action-heavy', 'mysterious', 'romantic', 'dark', 'hopeful',
]

const LENGTHS: { value: ResponseLength; label: string }[] = [
  { value: 'short', label: 'Short' },
  { value: 'medium', label: 'Medium' },
  { value: 'long', label: 'Long' },
  { value: 'paragraph+', label: 'Extended' },
]

export function RightPanel() {
  const { generation, setGeneration, availableModels, appSettings, ollamaHealthy, loadModels, modelsLoading } = useSettingsStore()
  const { activeChatId } = useChatsStore()
  const characters = useStoriesStore((st) => st.characters)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const [copied, setCopied] = useState(false)
  const [modelSwitched, setModelSwitched] = useState(false)
  const modelSwitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeSpeakers = useChatsStore((st) =>
    st.chats.find((c) => c.id === st.activeChatId)?.activeSpeakers ?? null
  ) ?? []

  const debugInfo = useChatsStore((st) => st.debugInfo)

  const chats = useChatsStore((st) => st.chats)
  const activeChat = chats.find((c) => c.id === activeChatId)

  const toggleMood = (tag: MoodTag) => {
    const current = generation.moodTags
    const next = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag]
    setGeneration({ moodTags: next })
  }

  const activeSpeakerChars = activeSpeakers
    .map((id) => characters.find((c) => c.id === id))
    .filter(Boolean)

  const copyPrompt = () => {
    if (!debugInfo) return
    navigator.clipboard.writeText(debugInfo.systemPrompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleModelChange = (value: string) => {
    setGeneration({ model: value })
    setModelSwitched(true)
    if (modelSwitchTimer.current) clearTimeout(modelSwitchTimer.current)
    modelSwitchTimer.current = setTimeout(() => setModelSwitched(false), 2000)
  }

  const effectiveModel = generation.model || appSettings.activeModel

  const ollamaStatusClass = ollamaHealthy === true ? s.dotOk : ollamaHealthy === false ? s.dotFail : s.dotUnknown

  return (
    <div class={s.root}>
      {/* Model selector */}
      <div class={s.section}>
        <div class={s.modelLabelRow}>
          <span class={s.label} style={{ margin: 0 }}>Model</span>
          <span class={ollamaStatusClass} title={ollamaHealthy === true ? 'Ollama connected' : ollamaHealthy === false ? 'Ollama unreachable' : 'Checking…'} />
          {modelSwitched && <span class={s.switchedBadge}>✓ switched</span>}
          <button
            class={s.refreshIconBtn}
            onClick={() => loadModels()}
            disabled={modelsLoading}
            title={modelsLoading ? 'Loading…' : 'Refresh model list'}
          >
            <span class={modelsLoading ? s.spinning : undefined}>↻</span>
          </button>
        </div>
        {availableModels.length > 0 ? (
          <select
            class={s.modelSelect}
            value={generation.model || appSettings.activeModel}
            onChange={(e) => handleModelChange((e.target as HTMLSelectElement).value)}
          >
            {availableModels.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        ) : (
          <input
            class={s.modelInput}
            type="text"
            placeholder={appSettings.activeModel || 'Enter model name…'}
            value={generation.model}
            onInput={(e) => handleModelChange((e.target as HTMLInputElement).value)}
          />
        )}
        {ollamaHealthy === false && (
          <div class={s.ollamaWarn}>Ollama unreachable — check Settings</div>
        )}
      </div>

      {/* Mode */}
      <div class={s.section}>
        <div class={s.label}>Mode</div>
        <div class={s.modeToggle}>
          <button
            class={s.modeBtn}
            data-active={!activeChat || activeChat.mode === 'interactive' ? 'true' : undefined}
          >
            Interactive RP
          </button>
          <button
            class={s.modeBtn}
            data-active={activeChat?.mode === 'storyteller' ? 'true' : undefined}
          >
            Storyteller
          </button>
        </div>
      </div>

      {/* Active speakers */}
      {activeSpeakerChars.length > 0 && (
        <div class={s.section}>
          <div class={s.label}>Speaking As</div>
          {activeSpeakerChars.map((char) => char && (
            <div key={char.id} class={s.speakerRow}>
              <div class={s.speakerAvatar}>{char.name[0]?.toUpperCase()}</div>
              <span>{char.name}</span>
              <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)' }}>{char.role}</span>
            </div>
          ))}
        </div>
      )}

      {/* Response length */}
      <div class={s.section}>
        <div class={s.label}>Response Length</div>
        <div class={s.lengthBtns}>
          {LENGTHS.map((l) => (
            <button
              key={l.value}
              class={s.lengthBtn}
              data-active={generation.responseLength === l.value ? 'true' : undefined}
              onClick={() => setGeneration({ responseLength: l.value })}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mood tags */}
      <div class={s.section}>
        <div class={s.label}>Mood</div>
        <div class={s.moodGrid}>
          {MOOD_TAGS.map((tag) => (
            <button
              key={tag}
              class={s.moodTag}
              data-active={generation.moodTags.includes(tag) ? 'true' : undefined}
              onClick={() => toggleMood(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Feel text */}
      <div class={s.section}>
        <div class={s.label}>Style Note</div>
        <textarea
          class={s.feelInput}
          placeholder="e.g. sharp dialogue, minimal narration, tension through silence…"
          value={generation.feelText}
          onInput={(e) => setGeneration({ feelText: (e.target as HTMLTextAreaElement).value })}
        />
      </div>

      {/* Advanced */}
      <div>
        <button class={s.advancedToggle} onClick={() => setShowAdvanced((v) => !v)}>
          <span>Advanced Parameters</span>
          <span class={s.chevron} data-open={showAdvanced ? 'true' : undefined}>▾</span>
        </button>

        {showAdvanced && (
          <div class={s.section} style={{ marginTop: '10px', gap: '12px' }}>
            <SliderRow
              label="Temperature"
              value={generation.temperature}
              min={0} max={2} step={0.05}
              onChange={(v) => setGeneration({ temperature: v })}
            />
            <SliderRow
              label="Top P"
              value={generation.top_p}
              min={0} max={1} step={0.05}
              onChange={(v) => setGeneration({ top_p: v })}
            />
            <SliderRow
              label="Top K"
              value={generation.top_k}
              min={1} max={100} step={1}
              onChange={(v) => setGeneration({ top_k: v })}
            />
            <SliderRow
              label="Repeat Penalty"
              value={generation.repeat_penalty}
              min={1} max={2} step={0.05}
              onChange={(v) => setGeneration({ repeat_penalty: v })}
            />
          </div>
        )}
      </div>

      {/* Debug panel */}
      <div>
        <button class={s.advancedToggle} onClick={() => setShowDebug((v) => !v)}>
          <span>Debug</span>
          <span class={s.chevron} data-open={showDebug ? 'true' : undefined}>▾</span>
        </button>

        {showDebug && (
          <div class={s.debugPanel}>
            <div class={s.debugRow}>
              <span class={s.debugKey}>Model</span>
              <span class={s.debugVal}>{debugInfo?.model ?? effectiveModel}</span>
            </div>
            {debugInfo ? (
              <>
                <div class={s.debugPromptHeader}>
                  <span class={s.debugKey}>System Prompt</span>
                  <button class={s.copyBtn} onClick={copyPrompt}>
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                <pre class={s.debugPrompt}>{debugInfo.systemPrompt}</pre>
              </>
            ) : (
              <div class={s.debugEmpty}>Send a message to see the system prompt</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SliderRow({
  label, value, min, max, step, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void
}) {
  return (
    <div class={s.sliderRow}>
      <div class={s.sliderLabel}>
        <span>{label}</span>
        <span class={s.sliderVal}>{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        class={s.slider}
        min={min} max={max} step={step}
        value={value}
        onInput={(e) => onChange(Number((e.target as HTMLInputElement).value))}
      />
    </div>
  )
}
