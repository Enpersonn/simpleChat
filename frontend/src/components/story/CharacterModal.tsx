import { useState } from 'preact/hooks'
import type { Character, CharacterCreate } from '@simplechat/types'
import { useStoriesStore } from '../../store/stories.js'
import { api } from '../../lib/api.js'
import s from './StoryCreateModal.module.css'

interface Props {
  initial?: Character
  initialDraft?: CharacterCreate
  defaultIsPersona?: boolean
  onClose: () => void
  onSaved: (char: Character) => void
  onSaveData?: (data: CharacterCreate) => void
}

export function CharacterModal({ initial, initialDraft, defaultIsPersona, onClose, onSaved, onSaveData }: Props) {
  const { createCharacter, updateCharacter, selectedStoryId } = useStoriesStore()
  const isEdit = !!initial

  const [name, setName] = useState(initial?.name ?? initialDraft?.name ?? '')
  const [role, setRole] = useState(initial?.role ?? initialDraft?.role ?? '')
  const [isUserPersona, setIsUserPersona] = useState(initial?.isUserPersona ?? initialDraft?.isUserPersona ?? defaultIsPersona ?? false)
  const [modelOverride, setModelOverride] = useState(initial?.modelOverride ?? initialDraft?.modelOverride ?? '')
  const [age, setAge] = useState(initial?.public.age ?? initialDraft?.public?.age ?? '')
  const [gender, setGender] = useState(initial?.public.gender ?? initialDraft?.public?.gender ?? '')
  const [species, setSpecies] = useState(initial?.public.species ?? initialDraft?.public?.species ?? 'human')
  const [clothing, setClothing] = useState(initial?.public.clothing ?? initialDraft?.public?.clothing ?? '')
  const [appearance, setAppearance] = useState(initial?.public.appearance ?? initialDraft?.public?.appearance ?? '')
  const [personality, setPersonality] = useState((initial?.public.personality ?? initialDraft?.public?.personality ?? []).join(', '))
  const [speechStyle, setSpeechStyle] = useState(initial?.public.speechStyle ?? initialDraft?.public?.speechStyle ?? '')
  const [trueMotives, setTrueMotives] = useState(initial?.private.trueMotives ?? initialDraft?.private?.trueMotives ?? '')
  const [fears, setFears] = useState((initial?.private.fears ?? initialDraft?.private?.fears ?? []).join(', '))
  const [genPrompt, setGenPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const toArray = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)

  const handleGenerate = async () => {
    if (!genPrompt.trim() || !selectedStoryId || generating) return
    setGenerating(true)
    setError('')
    try {
      const result = await api.characters.generateFields(selectedStoryId, genPrompt.trim())
      if (result.name) setName(result.name)
      if (result.role) setRole(result.role)
      if (result.age) setAge(result.age)
      if (result.gender) setGender(result.gender)
      if (result.species) setSpecies(result.species)
      if (result.clothing) setClothing(result.clothing)
      if (result.appearance) setAppearance(result.appearance)
      if (result.personality.length) setPersonality(result.personality.join(', '))
      if (result.speechStyle) setSpeechStyle(result.speechStyle)
      if (result.trueMotives) setTrueMotives(result.trueMotives)
      if (result.fears.length) setFears(result.fears.join(', '))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    setSubmitting(true)
    setError('')
    const data: CharacterCreate = {
      name: name.trim(),
      role: role.trim(),
      isUserPersona,
      modelOverride: modelOverride.trim(),
      public: {
        age: age.trim(),
        gender: gender.trim(),
        species: species.trim() || 'human',
        clothing: clothing.trim(),
        appearance: appearance.trim(),
        personality: toArray(personality),
        speechStyle: speechStyle.trim(),
        reputation: initial?.public.reputation ?? '',
        voiceNotes: initial?.public.voiceNotes ?? '',
      },
      private: {
        trueMotives: trueMotives.trim(),
        fears: toArray(fears),
        privateKnowledge: initial?.private.privateKnowledge ?? [],
        moralLimits: initial?.private.moralLimits ?? '',
        hiddenEmotionalState: initial?.private.hiddenEmotionalState ?? '',
      },
    }
    try {
      if (onSaveData) {
        onSaveData(data)
        onClose()
        return
      }
      const char = isEdit
        ? await updateCharacter(initial!.id, data)
        : await createCharacter(data)
      onSaved(char)
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  return (
    <div class={s.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div class={s.modal}>
        <div class={s.header}>
          <span class={s.title}>{isEdit ? (isUserPersona ? 'Edit Persona' : 'Edit Character') : (isUserPersona ? 'New Persona' : 'New Character')}</span>
          <button class={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {error && <div style={{ color: 'var(--error)', fontSize: '12px' }}>{error}</div>}

        {selectedStoryId && (
          <div class={s.generateSection}>
            <label class={s.label}>Generate from description</label>
            <div class={s.generateRow}>
              <textarea
                class={s.textarea}
                placeholder="e.g. a bitter old sea captain secretly searching for his lost daughter…"
                value={genPrompt}
                onInput={(e) => setGenPrompt((e.target as HTMLTextAreaElement).value)}
                style={{ minHeight: '56px', flex: 1 }}
              />
              <button
                class={s.generateBtn}
                onClick={handleGenerate}
                disabled={generating || !genPrompt.trim()}
              >
                {generating ? 'Generating…' : '✨ Generate'}
              </button>
            </div>
          </div>
        )}

        <div class={s.field}>
          <label class={s.label}>Name <span class={s.required}>*</span></label>
          <input class={s.input} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder="e.g. Seraphine Voss" />
        </div>

        <div class={s.field}>
          <label class={s.label}>Role / Title</label>
          <input class={s.input} value={role} onInput={(e) => setRole((e.target as HTMLInputElement).value)} placeholder="e.g. Merchant, Detective, Villain" />
        </div>

        <div class={s.field}>
          <label class={s.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'none', fontSize: '13px', letterSpacing: 0 }}>
            <input type="checkbox" checked={isUserPersona} onChange={(e) => setIsUserPersona((e.target as HTMLInputElement).checked)} />
            This is the player's persona (user character)
          </label>
        </div>

        <div class={s.field}>
          <label class={s.label}>Personal Info</label>
          <div class={s.infoGrid}>
            <div class={s.infoCell}>
              <span class={s.subLabel}>Age</span>
              <input class={s.input} value={age} onInput={(e) => setAge((e.target as HTMLInputElement).value)} placeholder="e.g. mid-30s" />
            </div>
            <div class={s.infoCell}>
              <span class={s.subLabel}>Gender</span>
              <input class={s.input} value={gender} onInput={(e) => setGender((e.target as HTMLInputElement).value)} placeholder="e.g. woman" />
            </div>
            <div class={s.infoCell}>
              <span class={s.subLabel}>Species</span>
              <input class={s.input} value={species} onInput={(e) => setSpecies((e.target as HTMLInputElement).value)} placeholder="e.g. human, wolf" />
            </div>
          </div>
        </div>

        <div class={s.field}>
          <label class={s.label}>Clothing</label>
          <input class={s.input} value={clothing} onInput={(e) => setClothing((e.target as HTMLInputElement).value)} placeholder="e.g. worn leather coat, silver earrings" />
        </div>

        <div class={s.field}>
          <label class={s.label}>Appearance</label>
          <textarea class={s.textarea} value={appearance} onInput={(e) => setAppearance((e.target as HTMLTextAreaElement).value)} placeholder="Physical description, mannerisms…" style={{ minHeight: '60px' }} />
        </div>

        <div class={s.field}>
          <label class={s.label}>Personality Traits <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>(comma-separated)</span></label>
          <input class={s.input} value={personality} onInput={(e) => setPersonality((e.target as HTMLInputElement).value)} placeholder="e.g. sardonic, loyal, restless" />
        </div>

        <div class={s.field}>
          <label class={s.label}>Speech Style</label>
          <textarea class={s.textarea} value={speechStyle} onInput={(e) => setSpeechStyle((e.target as HTMLTextAreaElement).value)} placeholder="How they speak — terse, verbose, formal, dialect…" style={{ minHeight: '56px' }} />
        </div>

        <div class={s.field}>
          <label class={s.label}>True Motives <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>(private — LLM only)</span></label>
          <textarea class={s.textarea} value={trueMotives} onInput={(e) => setTrueMotives((e.target as HTMLTextAreaElement).value)} placeholder="Hidden goals never directly revealed in play…" style={{ minHeight: '56px' }} />
        </div>

        <div class={s.field}>
          <label class={s.label}>Hidden Fears <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>(comma-separated, private)</span></label>
          <input class={s.input} value={fears} onInput={(e) => setFears((e.target as HTMLInputElement).value)} placeholder="e.g. abandonment, losing control" />
        </div>

        <div class={s.field}>
          <label class={s.label}>Model Override <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>(leave blank to use chat default)</span></label>
          <input class={s.input} value={modelOverride} onInput={(e) => setModelOverride((e.target as HTMLInputElement).value)} placeholder="e.g. llama3:8b" />
        </div>

        <div class={s.footer}>
          <button class={s.cancelBtn} onClick={onClose}>Cancel</button>
          <button class={s.submitBtn} onClick={handleSubmit} disabled={submitting || !name.trim()}>
            {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Character'}
          </button>
        </div>
      </div>
    </div>
  )
}
