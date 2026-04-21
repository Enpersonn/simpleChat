import { useState, useEffect } from 'preact/hooks'
import type { Character, CharacterCreate, CharacterMemory, CharacterMemoryCreate, CharacterDelta } from '@simplechat/types'
import { useStoriesStore } from '../../store/stories.js'
import { api } from '../../lib/api.js'
import s from './StoryCreateModal.module.css'
import ms from './CharacterModal.module.css'

interface Props {
  initial?: Character
  initialDraft?: CharacterCreate
  defaultIsPersona?: boolean
  onClose: () => void
  onSaved: (char: Character) => void
  onSaveData?: (data: CharacterCreate) => void
}

interface MemoryForm {
  id?: string
  summary: string
  tags: string
  importance: number
  branchLabel: string
  personalityAdd: string
  personalityRemove: string
  fearsAdd: string
  fearsRemove: string
  speechStyle: string
  trueMotives: string
  hiddenEmotionalState: string
  moralLimits: string
  showAdvanced: boolean
}

const emptyMemoryForm = (): MemoryForm => ({
  summary: '', tags: '', importance: 0.5, branchLabel: '',
  personalityAdd: '', personalityRemove: '',
  fearsAdd: '', fearsRemove: '',
  speechStyle: '', trueMotives: '', hiddenEmotionalState: '', moralLimits: '',
  showAdvanced: false,
})

function buildDelta(form: MemoryForm): CharacterDelta | undefined {
  const toArr = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)
  const pAdd = toArr(form.personalityAdd)
  const pRem = toArr(form.personalityRemove)
  const fAdd = toArr(form.fearsAdd)
  const fRem = toArr(form.fearsRemove)
  const hasPersonality = pAdd.length > 0 || pRem.length > 0
  const hasFears = fAdd.length > 0 || fRem.length > 0
  const hasStrings = form.speechStyle || form.trueMotives || form.hiddenEmotionalState || form.moralLimits

  if (!hasPersonality && !hasFears && !hasStrings) return undefined

  return {
    ...(hasPersonality ? { personality: { add: pAdd, remove: pRem } } : {}),
    ...(hasFears ? { fears: { add: fAdd, remove: fRem } } : {}),
    ...(form.speechStyle ? { speechStyle: form.speechStyle } : {}),
    ...(form.trueMotives ? { trueMotives: form.trueMotives } : {}),
    ...(form.hiddenEmotionalState ? { hiddenEmotionalState: form.hiddenEmotionalState } : {}),
    ...(form.moralLimits ? { moralLimits: form.moralLimits } : {}),
  }
}

function deltaToFormFields(d: CharacterDelta | undefined): Partial<MemoryForm> {
  if (!d) return {}
  return {
    personalityAdd: (d.personality?.add ?? []).join(', '),
    personalityRemove: (d.personality?.remove ?? []).join(', '),
    fearsAdd: (d.fears?.add ?? []).join(', '),
    fearsRemove: (d.fears?.remove ?? []).join(', '),
    speechStyle: d.speechStyle ?? '',
    trueMotives: d.trueMotives ?? '',
    hiddenEmotionalState: d.hiddenEmotionalState ?? '',
    moralLimits: d.moralLimits ?? '',
  }
}

export function CharacterModal({ initial, initialDraft, defaultIsPersona, onClose, onSaved, onSaveData }: Props) {
  const { createCharacter, updateCharacter, selectedStoryId } = useStoriesStore()
  const isEdit = !!initial

  const [activeTab, setActiveTab] = useState<'character' | 'memories'>('character')
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

  // Memories tab state
  const [memories, setMemories] = useState<CharacterMemory[]>([])
  const [memoryForm, setMemoryForm] = useState<MemoryForm | null>(null)
  const [memSaving, setMemSaving] = useState(false)

  useEffect(() => {
    if (isEdit && initial && selectedStoryId) {
      api.characterMemories.chain(selectedStoryId, initial.id).then(setMemories).catch(() => {})
    }
  }, [isEdit, initial?.id, selectedStoryId])

  const reloadMemories = () => {
    if (selectedStoryId && initial) {
      api.characterMemories.chain(selectedStoryId, initial.id).then(setMemories).catch(() => {})
    }
  }

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

  const openNewMemory = () => setMemoryForm(emptyMemoryForm())

  const openEditMemory = (m: CharacterMemory) => {
    setMemoryForm({
      id: m.id,
      summary: m.summary,
      tags: m.tags.join(', '),
      importance: m.importance,
      branchLabel: m.branchLabel ?? '',
      ...deltaToFormFields(m.deltas),
      showAdvanced: !!(m.deltas && (m.deltas.speechStyle || m.deltas.trueMotives || m.deltas.hiddenEmotionalState || m.deltas.moralLimits)),
    } as MemoryForm)
  }

  const handleSaveMemory = async () => {
    if (!memoryForm || !selectedStoryId || !initial) return
    if (!memoryForm.summary.trim()) return
    setMemSaving(true)
    try {
      const payload: CharacterMemoryCreate = {
        summary: memoryForm.summary.trim(),
        tags: toArray(memoryForm.tags),
        importance: memoryForm.importance,
        branchLabel: memoryForm.branchLabel.trim() || undefined,
        deltas: buildDelta(memoryForm),
      }
      if (memoryForm.id) {
        await api.characterMemories.update(selectedStoryId, initial.id, memoryForm.id, payload)
      } else {
        await api.characterMemories.create(selectedStoryId, initial.id, payload)
      }
      reloadMemories()
      setMemoryForm(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setMemSaving(false)
    }
  }

  const handleDeleteMemory = async (memId: string) => {
    if (!selectedStoryId || !initial) return
    await api.characterMemories.delete(selectedStoryId, initial.id, memId)
    reloadMemories()
  }

  const setMF = (patch: Partial<MemoryForm>) => setMemoryForm((prev) => prev ? { ...prev, ...patch } : prev)

  return (
    <div class={s.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div class={s.modal}>
        <div class={s.header}>
          <span class={s.title}>{isEdit ? (isUserPersona ? 'Edit Persona' : 'Edit Character') : (isUserPersona ? 'New Persona' : 'New Character')}</span>
          <button class={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {isEdit && (
          <div class={s.tabs}>
            <button class={s.tabBtn} data-active={activeTab === 'character' ? 'true' : undefined} onClick={() => setActiveTab('character')}>Character</button>
            <button class={s.tabBtn} data-active={activeTab === 'memories' ? 'true' : undefined} onClick={() => setActiveTab('memories')}>Memories</button>
          </div>
        )}

        {error && <div style={{ color: 'var(--error)', fontSize: '12px' }}>{error}</div>}

        {activeTab === 'character' && (
          <>
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
                  <button class={s.generateBtn} onClick={handleGenerate} disabled={generating || !genPrompt.trim()}>
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
          </>
        )}

        {activeTab === 'memories' && (
          <>
            {memoryForm === null ? (
              <>
                <div class={ms.memHeader}>
                  <span class={ms.memCount}>{memories.length} {memories.length === 1 ? 'memory' : 'memories'} in chain</span>
                  <button class={s.aiBtn} onClick={openNewMemory}>+ Add Memory</button>
                </div>

                {memories.length === 0 && (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 0' }}>
                    No memories yet. Add memories to shape how this character evolves over time.
                  </div>
                )}

                <div class={ms.memList}>
                  {memories.map((m) => (
                    <div key={m.id} class={ms.memCard}>
                      <div class={ms.memCardHeader}>
                        <span class={ms.memImportance} data-high={m.importance >= 0.8 ? 'true' : undefined}>
                          {Math.round(m.importance * 100)}%
                        </span>
                        {m.branchLabel && <span class={ms.memBranch}>{m.branchLabel}</span>}
                        <div class={ms.memActions}>
                          <button class={s.iconActionBtn} onClick={() => openEditMemory(m)}>✎</button>
                          <button class={s.iconActionBtn} onClick={() => handleDeleteMemory(m.id)}>✕</button>
                        </div>
                      </div>
                      <div class={ms.memSummary}>{m.summary}</div>
                      {m.tags.length > 0 && (
                        <div class={ms.memTags}>{m.tags.map((t) => <span key={t} class={ms.memTag}>{t}</span>)}</div>
                      )}
                      {m.deltas && (
                        <div class={ms.memDelta}>
                          {m.deltas.personality?.add && m.deltas.personality.add.length > 0 && (
                            <span class={ms.deltaItem} data-type="add">+{m.deltas.personality.add.join(', ')}</span>
                          )}
                          {m.deltas.personality?.remove && m.deltas.personality.remove.length > 0 && (
                            <span class={ms.deltaItem} data-type="remove">−{m.deltas.personality.remove.join(', ')}</span>
                          )}
                          {m.deltas.fears?.add && m.deltas.fears.add.length > 0 && (
                            <span class={ms.deltaItem} data-type="fear">fear: {m.deltas.fears.add.join(', ')}</span>
                          )}
                          {m.deltas.speechStyle && <span class={ms.deltaItem} data-type="override">speech override</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div class={ms.memForm}>
                <div class={s.field}>
                  <label class={s.label}>Summary <span class={s.required}>*</span></label>
                  <textarea
                    class={s.textarea}
                    placeholder="What happened? What changed for this character?"
                    value={memoryForm.summary}
                    onInput={(e) => setMF({ summary: (e.target as HTMLTextAreaElement).value })}
                    style={{ minHeight: '80px' }}
                  />
                </div>

                <div class={s.field}>
                  <label class={s.label}>Tags <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>(comma-separated)</span></label>
                  <input
                    class={s.input}
                    placeholder="e.g. betrayal, war, loss"
                    value={memoryForm.tags}
                    onInput={(e) => setMF({ tags: (e.target as HTMLInputElement).value })}
                  />
                </div>

                <div class={s.field}>
                  <label class={s.label}>Importance: {Math.round(memoryForm.importance * 100)}%</label>
                  <input
                    type="range" min="0" max="1" step="0.05"
                    value={memoryForm.importance}
                    onInput={(e) => setMF({ importance: parseFloat((e.target as HTMLInputElement).value) })}
                    style={{ width: '100%' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }}>
                    <span>Low</span><span>Always included at 80%+</span><span>High</span>
                  </div>
                </div>

                <div class={s.field}>
                  <label class={s.label}>Branch Label <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
                  <input
                    class={s.input}
                    placeholder="e.g. Before the war"
                    value={memoryForm.branchLabel}
                    onInput={(e) => setMF({ branchLabel: (e.target as HTMLInputElement).value })}
                  />
                </div>

                <div class={ms.advancedToggle}>
                  <button
                    class={ms.advancedBtn}
                    onClick={() => setMF({ showAdvanced: !memoryForm.showAdvanced })}
                  >
                    {memoryForm.showAdvanced ? '▾' : '▸'} Character Changes
                  </button>
                </div>

                {memoryForm.showAdvanced && (
                  <div class={ms.advancedSection}>
                    <div class={s.infoGrid}>
                      <div class={s.infoCell}>
                        <span class={s.subLabel}>Personality gained</span>
                        <input class={s.input} placeholder="e.g. paranoid, bitter" value={memoryForm.personalityAdd} onInput={(e) => setMF({ personalityAdd: (e.target as HTMLInputElement).value })} />
                      </div>
                      <div class={s.infoCell}>
                        <span class={s.subLabel}>Personality lost</span>
                        <input class={s.input} placeholder="e.g. naive, trusting" value={memoryForm.personalityRemove} onInput={(e) => setMF({ personalityRemove: (e.target as HTMLInputElement).value })} />
                      </div>
                    </div>

                    <div class={s.infoGrid} style={{ marginTop: '8px' }}>
                      <div class={s.infoCell}>
                        <span class={s.subLabel}>Fears gained</span>
                        <input class={s.input} placeholder="e.g. darkness" value={memoryForm.fearsAdd} onInput={(e) => setMF({ fearsAdd: (e.target as HTMLInputElement).value })} />
                      </div>
                      <div class={s.infoCell}>
                        <span class={s.subLabel}>Fears overcome</span>
                        <input class={s.input} placeholder="e.g. heights" value={memoryForm.fearsRemove} onInput={(e) => setMF({ fearsRemove: (e.target as HTMLInputElement).value })} />
                      </div>
                    </div>

                    <div class={s.field} style={{ marginTop: '8px' }}>
                      <label class={s.label}>Speech style override <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>(blank = no change)</span></label>
                      <input class={s.input} placeholder="Leave blank to keep current speech style" value={memoryForm.speechStyle} onInput={(e) => setMF({ speechStyle: (e.target as HTMLInputElement).value })} />
                    </div>

                    <div class={s.field}>
                      <label class={s.label}>True motives override</label>
                      <input class={s.input} placeholder="Leave blank to keep current" value={memoryForm.trueMotives} onInput={(e) => setMF({ trueMotives: (e.target as HTMLInputElement).value })} />
                    </div>

                    <div class={s.field}>
                      <label class={s.label}>Hidden emotional state override</label>
                      <input class={s.input} placeholder="Leave blank to keep current" value={memoryForm.hiddenEmotionalState} onInput={(e) => setMF({ hiddenEmotionalState: (e.target as HTMLInputElement).value })} />
                    </div>

                    <div class={s.field}>
                      <label class={s.label}>Moral limits override</label>
                      <input class={s.input} placeholder="Leave blank to keep current" value={memoryForm.moralLimits} onInput={(e) => setMF({ moralLimits: (e.target as HTMLInputElement).value })} />
                    </div>
                  </div>
                )}

                <div class={s.footer}>
                  <button class={s.cancelBtn} onClick={() => setMemoryForm(null)}>Cancel</button>
                  <button class={s.submitBtn} onClick={handleSaveMemory} disabled={memSaving || !memoryForm.summary.trim()}>
                    {memSaving ? 'Saving…' : memoryForm.id ? 'Save Changes' : 'Add Memory'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
