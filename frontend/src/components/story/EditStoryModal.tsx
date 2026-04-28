import { useState } from 'preact/hooks'
import type { Story, Character } from '@simplechat/types'
import { useStoriesStore } from '../../store/stories.js'
import { api } from '../../lib/api.js'
import { CharacterModal } from './CharacterModal.js'
import { DmChatTab } from './DmChatTab.js'
import s from './StoryCreateModal.module.css'
import dm from './EditStoryModal.module.css'

const GENRE_OPTIONS = ['Fantasy', 'Sci-Fi', 'Horror', 'Romance', 'Mystery', 'Thriller', 'Historical', 'Contemporary']
const TONE_OPTIONS = ['Dark', 'Light', 'Grim', 'Hopeful', 'Intimate', 'Epic', 'Tense', 'Whimsical', 'Melancholic', 'Romantic']

interface Props {
  story: Story
  onClose: () => void
  onSaved: (story: Story) => void
}

export function EditStoryModal({ story, onClose, onSaved }: Props) {
  const { updateStory, characters, deleteCharacter } = useStoriesStore()
  const [title, setTitle] = useState(story.title)
  const [premise, setPremise] = useState(story.premise)
  const [genres, setGenres] = useState<string[]>(story.genres)
  const [tones, setTones] = useState<string[]>(story.tone)
  const [rules, setRules] = useState(story.rules.join('\n'))
  const [writingStyle, setWritingStyle] = useState(story.writingStyle)
  const [systemPromptOverride, setSystemPromptOverride] = useState(story.systemPromptOverride ?? '')
  const [openingMessage, setOpeningMessage] = useState(story.openingMessage ?? '')
  const [customGenre, setCustomGenre] = useState('')
  const [customTone, setCustomTone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [editingChar, setEditingChar] = useState<Character | null | 'new' | 'new-persona'>(null)
  const [activeTab, setActiveTab] = useState<'settings' | 'dm'>('settings')

  const toggle = (arr: string[], val: string, setArr: (a: string[]) => void) => {
    setArr(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val])
  }

  const addCustomTag = (val: string, arr: string[], setArr: (a: string[]) => void, setInput: (v: string) => void) => {
    const trimmed = val.trim()
    if (trimmed && !arr.includes(trimmed)) setArr([...arr, trimmed])
    setInput('')
  }

  const handleRegenerate = async () => {
    if (generating) return
    setGenerating(true)
    setError('')
    try {
      const result = await api.stories.generateSupporting(story.id)
      if (result.genres.length) setGenres(result.genres)
      if (result.tone.length) setTones(result.tone)
      if (result.rules.length) setRules(result.rules.join('\n'))
      if (result.writingStyle) setWritingStyle(result.writingStyle)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  const handleSubmit = async () => {
    if (!title.trim()) { setError('Title is required'); return }
    setSubmitting(true)
    setError('')
    try {
      const updated = await updateStory(story.id, {
        title: title.trim(),
        premise: premise.trim(),
        genres,
        tone: tones,
        rules: rules.split('\n').map((r) => r.trim()).filter(Boolean),
        writingStyle: writingStyle.trim(),
        systemPromptOverride: systemPromptOverride.trim(),
        openingMessage: openingMessage.trim(),
      })
      onSaved(updated)
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  const handleDeleteChar = async (charId: string) => {
    if (!confirm('Delete this character?')) return
    try { await deleteCharacter(charId) } catch { /* ignore */ }
  }

  const customGenres = genres.filter((g) => !GENRE_OPTIONS.includes(g))
  const customTones  = tones.filter((t) => !TONE_OPTIONS.includes(t))

  return (
    <>
      <div class={s.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
        <div class={s.modal}>
          <div class={s.header}>
            <span class={s.title}>Edit Story</span>
            <button class={s.closeBtn} onClick={onClose}>✕</button>
          </div>

          <div class={dm.tabBar}>
            <button
              class={dm.tab}
              data-active={activeTab === 'settings' ? 'true' : undefined}
              onClick={() => setActiveTab('settings')}
            >
              Settings
            </button>
            <button
              class={dm.tab}
              data-active={activeTab === 'dm' ? 'true' : undefined}
              onClick={() => setActiveTab('dm')}
            >
              DM Chat
            </button>
          </div>

          {activeTab === 'dm' && <DmChatTab storyId={story.id} />}

          {activeTab === 'settings' && <>
          {error && <div style={{ color: 'var(--error)', fontSize: '12px' }}>{error}</div>}

          <div class={s.field}>
            <label class={s.label}>Title <span class={s.required}>*</span></label>
            <input class={s.input} value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} />
          </div>

          <div class={s.field}>
            <label class={s.label}>Premise</label>
            <textarea
              class={s.textarea}
              value={premise}
              onInput={(e) => setPremise((e.target as HTMLTextAreaElement).value)}
              placeholder="What is this story about?"
              style={{ minHeight: '120px' }}
            />
            <div class={s.aiBar}>
              <button
                class={s.aiBtn}
                onClick={handleRegenerate}
                disabled={generating || !premise.trim()}
                title="Regenerate genres, tone, rules and writing style from the current premise"
              >
                {generating ? '✨ Regenerating…' : '✨ Regenerate metadata from premise'}
              </button>
            </div>
          </div>

          <div class={s.field}>
            <label class={s.label}>Genre</label>
            <div class={s.tagGroup}>
              {GENRE_OPTIONS.map((g) => (
                <button
                  key={g}
                  class={s.tag}
                  data-active={genres.includes(g) ? 'true' : undefined}
                  onClick={() => toggle(genres, g, setGenres)}
                >
                  {g}
                </button>
              ))}
              {customGenres.map((g) => (
                <button key={g} class={s.tag} data-active="true" onClick={() => toggle(genres, g, setGenres)}>
                  {g}<span class={s.tagRemove}>×</span>
                </button>
              ))}
            </div>
            <div class={s.tagAddRow}>
              <input
                class={s.customTagInput}
                placeholder="Add genre…"
                value={customGenre}
                onInput={(e) => setCustomGenre((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(customGenre, genres, setGenres, setCustomGenre) } }}
              />
              <button class={s.tagAddBtn} onClick={() => addCustomTag(customGenre, genres, setGenres, setCustomGenre)}>+</button>
            </div>
          </div>

          <div class={s.field}>
            <label class={s.label}>Tone</label>
            <div class={s.tagGroup}>
              {TONE_OPTIONS.map((t) => (
                <button
                  key={t}
                  class={s.tag}
                  data-active={tones.includes(t) ? 'true' : undefined}
                  onClick={() => toggle(tones, t, setTones)}
                >
                  {t}
                </button>
              ))}
              {customTones.map((t) => (
                <button key={t} class={s.tag} data-active="true" onClick={() => toggle(tones, t, setTones)}>
                  {t}<span class={s.tagRemove}>×</span>
                </button>
              ))}
            </div>
            <div class={s.tagAddRow}>
              <input
                class={s.customTagInput}
                placeholder="Add tone…"
                value={customTone}
                onInput={(e) => setCustomTone((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(customTone, tones, setTones, setCustomTone) } }}
              />
              <button class={s.tagAddBtn} onClick={() => addCustomTag(customTone, tones, setTones, setCustomTone)}>+</button>
            </div>
          </div>

          <div class={s.field}>
            <label class={s.label}>World Rules <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(one per line)</span></label>
            <textarea class={s.textarea} value={rules} onInput={(e) => setRules((e.target as HTMLTextAreaElement).value)} style={{ minHeight: '60px' }} />
          </div>

          <div class={s.field}>
            <label class={s.label}>Writing Style</label>
            <textarea class={s.textarea} value={writingStyle} onInput={(e) => setWritingStyle((e.target as HTMLTextAreaElement).value)} style={{ minHeight: '56px' }} />
          </div>

          <div class={s.field}>
            <label class={s.label}>Opening Message <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional — used when starting a new chat)</span></label>
            <textarea
              class={s.textarea}
              placeholder="The scene opens on a rain-slicked street…"
              value={openingMessage}
              onInput={(e) => setOpeningMessage((e.target as HTMLTextAreaElement).value)}
              style={{ minHeight: '60px' }}
            />
          </div>

          <div class={s.field}>
            <label class={s.label}>System Prompt Override <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>(replaces all default instructions if set)</span></label>
            <textarea class={s.textarea} value={systemPromptOverride} onInput={(e) => setSystemPromptOverride((e.target as HTMLTextAreaElement).value)} placeholder="Leave blank to use default instructions…" style={{ minHeight: '80px' }} />
          </div>

          <div class={s.field}>
            <div class={s.charSectionHeader}>
              <label class={s.label} style={{ margin: 0 }}>Characters</label>
              <div class={s.charAddBtns}>
                <button class={s.aiBtn} onClick={() => setEditingChar('new-persona')}>+ Persona</button>
                <button class={s.aiBtn} onClick={() => setEditingChar('new')}>+ Character</button>
              </div>
            </div>
            {characters.length === 0 && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No characters yet.</div>
            )}
            {characters.map((c) => (
              <div key={c.id} class={s.charRow}>
                <span class={s.charIcon}>{c.isUserPersona ? '🧑' : '🎭'}</span>
                <span class={s.charName}>{c.name}</span>
                {c.role && <span class={s.charRole}>{c.role}</span>}
                <span class={s.charActions}>
                  <button class={s.iconActionBtn} onClick={() => setEditingChar(c)}>✎</button>
                  <button class={s.iconActionBtn} onClick={() => handleDeleteChar(c.id)}>✕</button>
                </span>
              </div>
            ))}
          </div>

          <div class={s.footer}>
            <button class={s.cancelBtn} onClick={onClose}>Cancel</button>
            <button class={s.submitBtn} onClick={handleSubmit} disabled={submitting || !title.trim()}>
              {submitting ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
          </>}
        </div>
      </div>

      {editingChar !== null && (
        <CharacterModal
          initial={editingChar === 'new' || editingChar === 'new-persona' ? undefined : editingChar}
          defaultIsPersona={editingChar === 'new-persona'}
          onClose={() => setEditingChar(null)}
          onSaved={() => setEditingChar(null)}
        />
      )}
    </>
  )
}
