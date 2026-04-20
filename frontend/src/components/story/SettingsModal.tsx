import { useState } from 'preact/hooks'
import { useSettingsStore } from '../../store/settings.js'
import s from './StoryCreateModal.module.css'
import ms from './SettingsModal.module.css'

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { appSettings, saveSettings, availableModels, loadModels, modelsLoading, ollamaHealthy, checkHealth } = useSettingsStore()

  const [endpoint, setEndpoint] = useState(appSettings.ollamaEndpoint)
  const [model, setModel] = useState(appSettings.activeModel)
  const [theme, setTheme] = useState(appSettings.theme)
  const [fontSize, setFontSize] = useState(appSettings.fontSize)
  const [globalNote, setGlobalNote] = useState(appSettings.globalNote)
  const [submitting, setSubmitting] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null)
  const [error, setError] = useState('')

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    // Save endpoint first so the backend uses the current value when testing
    try {
      await saveSettings({ ollamaEndpoint: endpoint.trim() })
    } catch {
      // non-fatal — the test will still reflect reality
    }
    await checkHealth()
    const store = useSettingsStore.getState()
    const healthy = store.ollamaHealthy
    setTestResult(healthy ? 'ok' : 'fail')
    if (healthy) {
      await loadModels()
    }
    setTesting(false)
  }

  const handleLoadModels = async () => {
    await loadModels()
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')
    try {
      await saveSettings({ ollamaEndpoint: endpoint.trim(), activeModel: model.trim(), theme, fontSize, globalNote: globalNote.trim() })
      document.documentElement.setAttribute('data-theme', theme)
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  const statusDot = ollamaHealthy === true
    ? <span class={ms.dot} data-status="ok" title="Ollama reachable" />
    : ollamaHealthy === false
    ? <span class={ms.dot} data-status="fail" title="Ollama unreachable" />
    : <span class={ms.dot} data-status="unknown" title="Status unknown" />

  return (
    <div class={s.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div class={s.modal} style={{ width: '460px' }}>
        <div class={s.header}>
          <span class={s.title}>Settings</span>
          <button class={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {error && <div style={{ color: 'var(--error)', fontSize: '12px' }}>{error}</div>}

        <div class={s.field}>
          <div class={ms.labelRow}>
            <label class={s.label}>Ollama Endpoint</label>
            {statusDot}
          </div>
          <div class={ms.modelRow}>
            <input class={s.input} style={{ flex: 1 }} value={endpoint} onInput={(e) => setEndpoint((e.target as HTMLInputElement).value)} placeholder="http://localhost:11434" />
            <button class={ms.testBtn} onClick={handleTest} disabled={testing}>
              {testing ? '…' : 'Test'}
            </button>
          </div>
          {testResult === 'ok' && (
            <div class={ms.statusMsg} data-ok="true">
              ✓ Connected — {availableModels.length} model{availableModels.length !== 1 ? 's' : ''} found
            </div>
          )}
          {testResult === 'fail' && (
            <div class={ms.statusMsg} data-ok="false">
              ✕ Could not reach Ollama at this endpoint. Is it running?
            </div>
          )}
        </div>

        <div class={s.field}>
          <label class={s.label}>Active Model (default)</label>
          <div class={ms.modelRow}>
            <input class={s.input} style={{ flex: 1 }} value={model} onInput={(e) => setModel((e.target as HTMLInputElement).value)} placeholder="e.g. llama3:8b" />
            <button
              class={ms.refreshBtn}
              onClick={handleLoadModels}
              disabled={modelsLoading}
              title={modelsLoading ? 'Loading…' : 'Load available models'}
              style={{ minWidth: '32px' }}
            >
              <span class={modelsLoading ? ms.spinning : undefined}>↻</span>
            </button>
          </div>
          {availableModels.length > 0 && (
            <div class={ms.modelList}>
              {availableModels.map((m) => (
                <button key={m} class={ms.modelOption} data-active={m === model ? 'true' : undefined} onClick={() => setModel(m)}>
                  {m}
                  {m === model && <span class={ms.checkmark}>✓</span>}
                </button>
              ))}
            </div>
          )}
          {availableModels.length === 0 && !modelsLoading && (
            <div class={ms.hint}>Click ↻ to load available models from Ollama</div>
          )}
          {modelsLoading && <div class={ms.hint}>Loading models…</div>}
        </div>

        <div class={s.field}>
          <label class={s.label}>Theme</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['dark', 'light'] as const).map((t) => (
              <button key={t} class={s.tag} data-active={theme === t ? 'true' : undefined} onClick={() => setTheme(t)} style={{ flex: 1, textAlign: 'center' }}>
                {t === 'dark' ? '🌙 Dark' : '☀️ Light'}
              </button>
            ))}
          </div>
        </div>

        <div class={s.field}>
          <label class={s.label}>Font Size ({fontSize}px)</label>
          <input type="range" min={12} max={20} step={1} value={fontSize} onInput={(e) => setFontSize(Number((e.target as HTMLInputElement).value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
        </div>

        <div class={s.field}>
          <label class={s.label}>Global Note <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>(appended to every system prompt)</span></label>
          <textarea class={s.textarea} value={globalNote} onInput={(e) => setGlobalNote((e.target as HTMLTextAreaElement).value)} placeholder="e.g. always write in present tense, avoid purple prose…" style={{ minHeight: '72px' }} />
        </div>

        <div class={s.footer}>
          <button class={s.cancelBtn} onClick={onClose}>Cancel</button>
          <button class={s.submitBtn} onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
