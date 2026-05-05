import { useState } from 'preact/hooks'
import type { Story, CharacterCreate, LocationCreate, MemoryDeltaEffect } from '@simplechat/types'
import { useStoriesStore } from '../../store/stories.js'
import { api } from '../../lib/api.js'
import { CharacterModal } from './CharacterModal.js'
import { f } from '../shared/formCls.js'

const GENRE_OPTIONS = ['Fantasy', 'Sci-Fi', 'Horror', 'Romance', 'Mystery', 'Thriller', 'Historical', 'Contemporary']
const TONE_OPTIONS = ['Dark', 'Light', 'Grim', 'Hopeful', 'Intimate', 'Epic', 'Tense', 'Whimsical', 'Melancholic', 'Romantic']

const DRAFT_STEPS = ['Building story core…', 'Generating characters…', 'Generating locations…', 'Generating backstory…']
const PARSE_STEPS = ['Analysing story…', 'Extracting characters…', 'Extracting locations…', 'Extracting memories…']

type RawRelation = { otherCharacterName: string; emotion: string; publicAttitude: string; privateAttitude: string; trustLevel: number }
interface PendingChar extends CharacterCreate { _localId: string; _rawRelationships?: RawRelation[] }
interface PendingLocation extends LocationCreate { _localId: string }
interface PendingMemory {
  _localId: string
  characterName: string
  summary: string
  tags: string[]
  importance: number
  deltas?: Record<string, unknown>
  relationshipEffects?: RawRelation[]
}

function convertDeltasToEffects(deltas: Record<string, unknown>): MemoryDeltaEffect[] {
  const effects: MemoryDeltaEffect[] = []
  for (const [field, path] of [
    ['personality', 'public.personality'],
    ['fears', 'private.fears'],
    ['privateKnowledge', 'private.privateKnowledge'],
  ] as const) {
    const group = deltas[field] as { add?: string[]; remove?: string[] } | undefined
    for (const v of group?.add ?? [])
      effects.push({ path, op: 'add', value: v, weight: 1, entityType: 'character' })
    for (const v of group?.remove ?? [])
      effects.push({ path, op: 'remove', value: v, weight: 1, entityType: 'character' })
  }
  for (const [field, path] of [
    ['speechStyle', 'public.speechStyle'],
    ['appearance', 'public.appearance'],
    ['clothing', 'public.clothing'],
    ['reputation', 'public.reputation'],
    ['trueMotives', 'private.trueMotives'],
    ['hiddenEmotionalState', 'private.hiddenEmotionalState'],
    ['moralLimits', 'private.moralLimits'],
  ] as const) {
    if (typeof deltas[field] === 'string')
      effects.push({ path, op: 'set', value: deltas[field] as string, weight: 1, entityType: 'character' })
  }
  return effects
}

interface LivePreview {
  title: string
  genres: string[]
  tone: string[]
  characters: Array<{ name: string; role: string; isUserPersona: boolean }>
  locations: Array<{ name: string; description: string }>
  memories: Array<{ characterName: string; summary: string; importance: number }>
}

const emptyPreview = (): LivePreview => ({ title: '', genres: [], tone: [], characters: [], locations: [], memories: [] })

interface Props {
  onClose: () => void
  onCreated: (story: Story) => void
}

export function StoryCreateModal({ onClose, onCreated }: Props) {
  const createStory = useStoriesStore((s) => s.createStory)
  const [tab, setTab] = useState<'write' | 'import'>('write')
  const [importText, setImportText] = useState('')
  const [title, setTitle] = useState('')
  const [premise, setPremise] = useState('')
  const [openingMessage, setOpeningMessage] = useState('')
  const [genres, setGenres] = useState<string[]>([])
  const [tones, setTones] = useState<string[]>([])
  const [rules, setRules] = useState('')
  const [writingStyle, setWritingStyle] = useState('')
  const [customGenre, setCustomGenre] = useState('')
  const [customTone, setCustomTone] = useState('')
  const [pendingChars, setPendingChars] = useState<PendingChar[]>([])
  const [pendingLocations, setPendingLocations] = useState<PendingLocation[]>([])
  const [pendingMemories, setPendingMemories] = useState<PendingMemory[]>([])
  const [editingChar, setEditingChar] = useState<PendingChar | 'new' | 'new-persona' | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [genStep, setGenStep] = useState<0 | 1 | 2 | 3 | 4>(0)
  const [error, setError] = useState('')
  const [livePreview, setLivePreview] = useState<LivePreview>(emptyPreview())

  const toggle = (arr: string[], val: string, setArr: (a: string[]) => void) => {
    setArr(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val])
  }

  const addCustomTag = (val: string, arr: string[], setArr: (a: string[]) => void, setInput: (v: string) => void) => {
    const trimmed = val.trim()
    if (trimmed && !arr.includes(trimmed)) setArr([...arr, trimmed])
    setInput('')
  }

  const applyGeneratedFields = (result: {
    title?: string; premise?: string; genres: string[]; tone: string[]; rules: string[]; writingStyle: string | { prose?: string }
    characters: Array<{ name: string; role: string; isUserPersona: boolean; age: string; gender: string; species: string; clothing: string; appearance: string; personality: string[]; speechStyle: string; trueMotives: string; fears: string[]; relationships?: RawRelation[] }>
    locations?: Array<{ name: string; description: string; layout: string; lighting: string; atmosphere: string; soundscape: string; smells: string; notes: string; tags: string[] }>
  }) => {
    if (result.title && !title.trim()) setTitle(result.title)
    if (result.premise) setPremise(result.premise)
    if (result.genres.length) setGenres(result.genres)
    if (result.tone.length) setTones(result.tone)
    if (result.rules.length) setRules(result.rules.join('\n'))
    if (result.writingStyle) setWritingStyle(
      typeof result.writingStyle === 'string' ? result.writingStyle : result.writingStyle.prose ?? ''
    )
    if (result.characters?.length) {
      const newChars: PendingChar[] = result.characters.map((c, i) => ({
        _localId: `draft-${Date.now()}-${i}`,
        name: c.name,
        role: c.role,
        isUserPersona: c.isUserPersona,
        public: {
          age: c.age, gender: c.gender, species: c.species || 'human',
          clothing: c.clothing, appearance: c.appearance,
          personality: c.personality, speechStyle: c.speechStyle,
          reputation: '', voiceNotes: '',
        },
        private: {
          trueMotives: c.trueMotives, fears: c.fears,
          privateKnowledge: [], moralLimits: '', hiddenEmotionalState: '',
        },
        _rawRelationships: c.relationships?.length ? c.relationships : undefined,
      }))
      setPendingChars((prev) => [...prev, ...newChars])
    }
    if (result.locations?.length) {
      const newLocs: PendingLocation[] = result.locations.map((l, i) => ({
        _localId: `loc-${Date.now()}-${i}`,
        name: l.name,
        description: l.description,
        layout: l.layout,
        lighting: l.lighting,
        atmosphere: l.atmosphere,
        soundscape: l.soundscape,
        smells: l.smells,
        notes: l.notes,
        tags: l.tags,
      }))
      setPendingLocations((prev) => [...prev, ...newLocs])
    }
  }

  const generating = genStep > 0

  const handleDraft = async () => {
    if (!premise.trim() || generating) return
    setGenStep(1)
    setError('')
    setLivePreview(emptyPreview())
    try {
      const core = await api.ai.generate<{ title?: string; genres: string[]; tone: string[]; rules: string[]; writingStyle: { prose?: string } }>(
        'story-core', premise.trim(), { includeTitle: !title.trim() },
      )
      applyGeneratedFields({ ...core, characters: [] })
      setLivePreview((p) => ({
        ...p,
        title: core.title ?? title,
        genres: core.genres,
        tone: core.tone,
      }))
      setGenStep(2)
      const styleContext = [
        core.genres.length ? `Genres: ${core.genres.join(', ')}` : '',
        core.tone.length ? `Tone: ${core.tone.join(', ')}` : '',
        core.writingStyle?.prose ? `Writing style: ${core.writingStyle.prose}` : '',
      ].filter(Boolean).join('\n')
      const { characters } = await api.ai.generate<{ characters: Array<{
        name: string; role: string; isUserPersona: boolean; age: string; gender: string
        species: string; clothing: string; appearance: string; personality: string[]
        speechStyle: string; trueMotives: string; fears: string[]
        relationships?: Array<{ otherCharacterName: string; emotion: string; publicAttitude: string; privateAttitude: string; trustLevel: number }>
      }> }>('story-characters', premise.trim(), { styleContext })
      applyGeneratedFields({ genres: [], tone: [], rules: [], writingStyle: '', characters })
      setLivePreview((p) => ({
        ...p,
        characters: characters.map((c) => ({ name: c.name, role: c.role, isUserPersona: c.isUserPersona })),
      }))
      setGenStep(3)
      const { locations } = await api.ai.generate<{ locations: Array<{
        name: string; description: string; layout: string; lighting: string
        atmosphere: string; soundscape: string; smells: string; notes: string; tags: string[]
      }> }>('story-locations', premise.trim(), { styleContext })
      applyGeneratedFields({ genres: [], tone: [], rules: [], writingStyle: '', characters: [], locations })
      setLivePreview((p) => ({
        ...p,
        locations: locations.map((l) => ({ name: l.name, description: l.description })),
      }))
      setGenStep(4)
      const { memories } = await api.ai.generate<{ memories: Array<{
        characterName: string; summary: string; tags: string[]; importance: number
        deltas?: Record<string, unknown>
        relationshipEffects?: Array<{ otherCharacterName: string; emotion: string; publicAttitude: string; privateAttitude: string; trustLevel: number }>
      }> }>('story-memories', premise.trim(), {
        premise: premise.trim(),
        characterNames: characters.map((c) => c.name),
      })
      if (memories.length > 0) {
        const newMems: PendingMemory[] = memories.map((m, i) => ({
          _localId: `mem-${Date.now()}-${i}`,
          characterName: m.characterName,
          summary: m.summary,
          tags: m.tags,
          importance: m.importance,
          deltas: m.deltas,
          relationshipEffects: m.relationshipEffects,
        }))
        setPendingMemories((prev) => [...prev, ...newMems])
        setLivePreview((p) => ({
          ...p,
          memories: memories.map((m) => ({ characterName: m.characterName, summary: m.summary, importance: m.importance })),
        }))
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setGenStep(0)
    }
  }

  const handleParse = async () => {
    if (!importText.trim() || generating) return
    setGenStep(1)
    setError('')
    setLivePreview(emptyPreview())
    try {
      const core = await api.ai.parse<{ title: string; premise: string; genres: string[]; tone: string[]; rules: string[]; writingStyle: { prose?: string } }>(
        'story-core', importText.trim(),
      )
      applyGeneratedFields({ ...core, characters: [], locations: [] })
      setLivePreview((p) => ({ ...p, title: core.title, genres: core.genres, tone: core.tone }))
      setGenStep(2)
      const { characters } = await api.ai.parse<{ characters: Array<{
        name: string; role: string; isUserPersona: boolean; age: string; gender: string
        species: string; clothing: string; appearance: string; personality: string[]
        speechStyle: string; trueMotives: string; fears: string[]
        relationships?: Array<{ otherCharacterName: string; emotion: string; publicAttitude: string; privateAttitude: string; trustLevel: number }>
      }> }>('story-characters', importText.trim(), { premise: core.premise })
      applyGeneratedFields({ genres: [], tone: [], rules: [], writingStyle: '', characters, locations: [] })
      setLivePreview((p) => ({
        ...p,
        characters: characters.map((c) => ({ name: c.name, role: c.role, isUserPersona: c.isUserPersona })),
      }))
      setGenStep(3)
      const { locations } = await api.ai.parse<{ locations: Array<{
        name: string; description: string; layout: string; lighting: string
        atmosphere: string; soundscape: string; smells: string; notes: string; tags: string[]
      }> }>('story-locations', importText.trim(), { premise: core.premise })
      applyGeneratedFields({ genres: [], tone: [], rules: [], writingStyle: '', characters: [], locations })
      setLivePreview((p) => ({
        ...p,
        locations: locations.map((l) => ({ name: l.name, description: l.description })),
      }))
      setGenStep(4)
      const { memories } = await api.ai.parse<{ memories: Array<{
        characterName: string; summary: string; tags: string[]; importance: number
        deltas?: Record<string, unknown>
        relationshipEffects?: Array<{ otherCharacterName: string; emotion: string; publicAttitude: string; privateAttitude: string; trustLevel: number }>
      }> }>('story-memories', importText.trim(), {
        premise: core.premise,
        characterNames: characters.map((c) => c.name),
      })
      if (memories.length > 0) {
        const newMems: PendingMemory[] = memories.map((m, i) => ({
          _localId: `mem-${Date.now()}-${i}`,
          characterName: m.characterName,
          summary: m.summary,
          tags: m.tags,
          importance: m.importance,
          deltas: m.deltas,
          relationshipEffects: m.relationshipEffects,
        }))
        setPendingMemories((prev) => [...prev, ...newMems])
        setLivePreview((p) => ({
          ...p,
          memories: memories.map((m) => ({ characterName: m.characterName, summary: m.summary, importance: m.importance })),
        }))
      }
      setTab('write')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setGenStep(0)
    }
  }

  const handleSubmit = async () => {
    if (!title.trim()) { setError('Title is required'); return }
    setSubmitting(true)
    setError('')
    try {
      const story = await createStory({
        title: title.trim(),
        premise: premise.trim(),
        genres,
        tone: tones,
        rules: { worldRules: rules.split('\n').map((r) => r.trim()).filter(Boolean), storyRules: [], characterRules: [] },
        writingStyle: { prose: writingStyle.trim(), interiority: '', dialogue: '', pacing: '', sensory: '' },
        openingMessage: openingMessage.trim(),
      })

      const createdChars: Array<{ id: string; name: string }> = []
      for (const { _localId: _, _rawRelationships: __, ...charData } of pendingChars) {
        const char = await api.characters.create(story.id, charData)
        createdChars.push({ id: char.id, name: char.name })
      }

      const resolveName = (name: string) => createdChars.find((c) => c.name.toLowerCase() === name.toLowerCase())

      for (const pending of pendingChars) {
        if (!pending._rawRelationships?.length) continue
        const char = resolveName(pending.name)
        if (!char) continue
        const relationships = pending._rawRelationships
          .map((r) => {
            const other = resolveName(r.otherCharacterName)
            if (!other) return null
            return { charId: other.id, emotion: r.emotion, publicAttitude: r.publicAttitude, privateAttitude: r.privateAttitude, trustLevel: r.trustLevel, history: '', visibility: 'public' as const }
          })
          .filter((r): r is NonNullable<typeof r> => r !== null)
        if (relationships.length > 0) {
          await api.characters.update(story.id, char.id, { relationships })
        }
      }

      for (const { _localId: _, ...locData } of pendingLocations) {
        await api.locations.create(story.id, locData)
      }

      for (const { _localId: _, characterName, summary, tags, importance, deltas, relationshipEffects } of pendingMemories) {
        const char = resolveName(characterName)
        if (!char) continue
        const resolvedRelDelta = (relationshipEffects ?? [])
          .map((r) => {
            const other = resolveName(r.otherCharacterName)
            if (!other) return null
            return { charId: other.id, emotion: r.emotion || undefined, publicAttitude: r.publicAttitude || undefined, privateAttitude: r.privateAttitude || undefined, trustLevel: r.trustLevel }
          })
          .filter((r): r is NonNullable<typeof r> => r !== null)
        const effects: MemoryDeltaEffect[] = [
          ...convertDeltasToEffects(deltas ?? {}),
          ...(resolvedRelDelta.length
            ? [{ path: 'relationships', op: 'set' as const, value: resolvedRelDelta as Record<string, unknown>[], weight: 1, entityType: 'character' }]
            : []),
        ]
        const { memory } = await api.characterMemories.create(story.id, char.id, {
          summary,
          tags,
          importance,
          deltas: { effects },
        })
        await api.canonTimeline.addEntry(story.id, {
          characterId: char.id,
          memoryId: memory.id,
          label: summary.slice(0, 60),
        })
      }

      onCreated(story)
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  const saveChar = (data: CharacterCreate) => {
    if (editingChar === 'new' || editingChar === 'new-persona') {
      setPendingChars((prev) => [...prev, { ...data, _localId: `char-${Date.now()}` }])
    } else if (editingChar) {
      const id = editingChar._localId
      setPendingChars((prev) => prev.map((c) => c._localId === id ? { ...data, _localId: id } : c))
    }
  }

  const removeChar = (localId: string) => setPendingChars((prev) => prev.filter((c) => c._localId !== localId))
  const removeLoc = (localId: string) => setPendingLocations((prev) => prev.filter((l) => l._localId !== localId))

  const customGenres = genres.filter((g) => !GENRE_OPTIONS.includes(g))
  const customTones  = tones.filter((t) => !TONE_OPTIONS.includes(t))

  const steps = tab === 'import' ? PARSE_STEPS : DRAFT_STEPS
  const showPreview = generating || livePreview.title !== ''

  const formContent = (
    <>
      {error && <div class={f.errorMsg}>{error}</div>}

      {genStep > 0 && (
        <div class={f.genProgress}>
          <span class={f.genSpinner}>↻</span>
          <span class={f.genLabel}>{steps[genStep - 1]}</span>
          <span class={f.genCount}>{genStep} / {steps.length}</span>
        </div>
      )}

      {tab === 'import' && (
        <div class={f.field}>
          <label class={f.label}>Paste your story notes, excerpts, or drafts</label>
          <textarea
            class={f.textarea}
            placeholder="Paste story notes, chapter drafts, character sketches, world-building notes…"
            value={importText}
            onInput={(e) => setImportText((e.target as HTMLTextAreaElement).value)}
            style={{ minHeight: '220px' }}
          />
          <div class={f.aiBar}>
            <button
              class={f.aiBtn}
              onClick={handleParse}
              disabled={generating || !importText.trim()}
            >
              {generating ? '✨ Parsing…' : '✨ Parse & Generate'}
            </button>
          </div>
          <div class="text-[11px] text-text-muted mt-1">
            The LLM will synthesise a clean premise and extract characters, locations, and canon memories. Review all fields before creating.
          </div>
        </div>
      )}

      {tab === 'write' && (
        <>
          <div class={f.field}>
            <label class={f.label}>Title <span class={f.required}>*</span></label>
            <input
              class={f.input}
              placeholder="e.g. Ashes of Vallor"
              value={title}
              onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
            />
          </div>

          <div class={f.field}>
            <label class={f.label}>Premise</label>
            <textarea
              class={f.textarea}
              placeholder="What is this story about? Who are the key players? What world does it inhabit?"
              value={premise}
              onInput={(e) => setPremise((e.target as HTMLTextAreaElement).value)}
              style={{ minHeight: '120px' }}
            />
            <div class={f.aiBar}>
              <button
                class={f.aiBtn}
                onClick={handleDraft}
                disabled={generating || !premise.trim()}
                title="Use the premise to generate genres, tone, rules, writing style, characters, locations and backstory"
              >
                {generating ? '✨ Drafting…' : '✨ Draft all fields from premise'}
              </button>
            </div>
          </div>

          <div class={f.field}>
            <label class={f.label}>Genre</label>
            <div class={f.tagGroup}>
              {GENRE_OPTIONS.map((g) => (
                <button
                  key={g}
                  class={f.tag}
                  data-active={genres.includes(g) ? 'true' : undefined}
                  onClick={() => toggle(genres, g, setGenres)}
                >
                  {g}
                </button>
              ))}
              {customGenres.map((g) => (
                <button key={g} class={f.tag} data-active="true" onClick={() => toggle(genres, g, setGenres)}>
                  {g}<span class={f.tagRemove}>×</span>
                </button>
              ))}
            </div>
            <div class={f.tagAddRow}>
              <input
                class={f.customTagInput}
                placeholder="Add genre…"
                value={customGenre}
                onInput={(e) => setCustomGenre((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(customGenre, genres, setGenres, setCustomGenre) } }}
              />
              <button class={f.tagAddBtn} onClick={() => addCustomTag(customGenre, genres, setGenres, setCustomGenre)}>+</button>
            </div>
          </div>

          <div class={f.field}>
            <label class={f.label}>Tone</label>
            <div class={f.tagGroup}>
              {TONE_OPTIONS.map((t) => (
                <button
                  key={t}
                  class={f.tag}
                  data-active={tones.includes(t) ? 'true' : undefined}
                  onClick={() => toggle(tones, t, setTones)}
                >
                  {t}
                </button>
              ))}
              {customTones.map((t) => (
                <button key={t} class={f.tag} data-active="true" onClick={() => toggle(tones, t, setTones)}>
                  {t}<span class={f.tagRemove}>×</span>
                </button>
              ))}
            </div>
            <div class={f.tagAddRow}>
              <input
                class={f.customTagInput}
                placeholder="Add tone…"
                value={customTone}
                onInput={(e) => setCustomTone((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(customTone, tones, setTones, setCustomTone) } }}
              />
              <button class={f.tagAddBtn} onClick={() => addCustomTag(customTone, tones, setTones, setCustomTone)}>+</button>
            </div>
          </div>

          <div class={f.field}>
            <label class={f.label}>World Rules <span class={f.labelHint}>(one per line)</span></label>
            <textarea
              class={f.textarea}
              placeholder={"No modern technology\nMagic has a social cost\nThe gods are silent"}
              value={rules}
              onInput={(e) => setRules((e.target as HTMLTextAreaElement).value)}
              style={{ minHeight: '60px' }}
            />
          </div>

          <div class={f.field}>
            <label class={f.label}>Writing Style</label>
            <textarea
              class={f.textarea}
              placeholder="e.g. cinematic, sensory-rich, short punchy dialogue, third-person intimate"
              value={writingStyle}
              onInput={(e) => setWritingStyle((e.target as HTMLTextAreaElement).value)}
              style={{ minHeight: '56px' }}
            />
          </div>

          <div class={f.field}>
            <label class={f.label}>Opening Message <span class={f.labelHint}>(optional)</span></label>
            <textarea
              class={f.textarea}
              placeholder="The scene opens on a rain-slicked street…"
              value={openingMessage}
              onInput={(e) => setOpeningMessage((e.target as HTMLTextAreaElement).value)}
              style={{ minHeight: '60px' }}
            />
          </div>

          <div class={f.field}>
            <div class={f.charSectionHeader}>
              <label class={f.label} style={{ margin: 0 }}>Characters</label>
              <div class={f.charAddBtns}>
                <button class={f.aiBtn} onClick={() => setEditingChar('new-persona')}>+ Persona</button>
                <button class={f.aiBtn} onClick={() => setEditingChar('new')}>+ Character</button>
              </div>
            </div>
            {pendingChars.length === 0 && (
              <div class="text-xs text-text-muted">No characters yet — draft from premise or add manually.</div>
            )}
            {pendingChars.map((c) => (
              <div key={c._localId} class={f.charRow}>
                <span class={f.charIcon}>{c.isUserPersona ? '🧑' : '🎭'}</span>
                <span class={f.charName}>{c.name}</span>
                {c.role && <span class={f.charRole}>{c.role}</span>}
                <span class={f.charActions}>
                  <button class={f.iconActionBtn} onClick={() => setEditingChar(c)}>✎</button>
                  <button class={f.iconActionBtn} onClick={() => removeChar(c._localId)}>✕</button>
                </span>
              </div>
            ))}
          </div>

          {pendingLocations.length > 0 && (
            <div class={f.field}>
              <label class={f.label}>Locations</label>
              {pendingLocations.map((l) => (
                <div key={l._localId} class={f.charRow}>
                  <span class={f.charIcon}>📍</span>
                  <span class={f.charName}>{l.name}</span>
                  {l.description && <span class={f.charRole}>{l.description}</span>}
                  <span class={f.charActions}>
                    <button class={f.iconActionBtn} onClick={() => removeLoc(l._localId)}>✕</button>
                  </span>
                </div>
              ))}
            </div>
          )}

          {pendingMemories.length > 0 && (
            <div class={f.field}>
              <label class={f.label}>Canon Memories <span class={f.labelHint}>({pendingMemories.length} events extracted)</span></label>
              {pendingMemories.map((m) => (
                <div key={m._localId} class={f.charRow}>
                  <span class={f.charIcon}>🧠</span>
                  <span class={f.charName} title={m.summary} style={{ fontStyle: 'italic' }}>{m.characterName}</span>
                  <span class={f.charRole} title={m.summary}>{m.summary.slice(0, 50)}{m.summary.length > 50 ? '…' : ''}</span>
                  <span class={f.charActions}>
                    <button class={f.iconActionBtn} onClick={() => setPendingMemories((prev) => prev.filter((x) => x._localId !== m._localId))}>✕</button>
                  </span>
                </div>
              ))}
              <div class="text-[11px] text-text-muted mt-1">
                These will be added to the canon timeline on story creation. Remove any you don't want.
              </div>
            </div>
          )}
        </>
      )}

      <div class={f.footer}>
        <button class={f.cancelBtn} onClick={onClose}>Cancel</button>
        {tab === 'import' ? (
          <button class={f.submitBtn} onClick={() => setTab('write')} disabled={generating}>
            {generating ? 'Parsing…' : 'Review fields →'}
          </button>
        ) : (
          <button class={f.submitBtn} onClick={handleSubmit} disabled={submitting || !title.trim()}>
            {submitting ? 'Creating…' : 'Create Story'}
          </button>
        )}
      </div>
    </>
  )

  return (
    <>
      <div class={f.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
        <div class={showPreview ? f.modalWide : f.modal}>
          <div class={f.header}>
            <span class={f.title}>New Story</span>
            <button class={f.closeBtn} onClick={onClose}>✕</button>
          </div>

          {showPreview ? (
            <div class="flex flex-row flex-1 min-h-0 -mx-6">
              <div class="w-[520px] shrink-0 overflow-y-auto px-6 pt-1 pb-6 flex flex-col gap-4.5">
                <div class={f.tabs}>
                  <button type="button" class={f.tabBtn} data-active={tab === 'write' ? 'true' : undefined} onClick={() => setTab('write')}>Write</button>
                  <button type="button" class={f.tabBtn} data-active={tab === 'import' ? 'true' : undefined} onClick={() => setTab('import')}>Import from text</button>
                </div>
                {formContent}
              </div>
              <div class="flex-1 min-w-[260px] overflow-y-auto px-6 pt-1 pb-6 border-l border-border bg-bg-primary">
                <StoryPreviewPanel preview={livePreview} genStep={genStep} tab={tab} />
              </div>
            </div>
          ) : (
            <>
              <div class={f.tabs}>
                <button type="button" class={f.tabBtn} data-active={tab === 'write' ? 'true' : undefined} onClick={() => setTab('write')}>Write</button>
                <button type="button" class={f.tabBtn} data-active={tab === 'import' ? 'true' : undefined} onClick={() => setTab('import')}>Import from text</button>
              </div>
              {formContent}
            </>
          )}
        </div>
      </div>

      {editingChar !== null && (
        <CharacterModal
          initialDraft={editingChar === 'new' || editingChar === 'new-persona' ? undefined : editingChar}
          defaultIsPersona={editingChar === 'new-persona' || (typeof editingChar === 'object' && !!editingChar?.isUserPersona)}
          onClose={() => setEditingChar(null)}
          onSaved={() => setEditingChar(null)}
          onSaveData={saveChar}
        />
      )}
    </>
  )
}

// ─── Live Preview Panel ───────────────────────────────────────────────────────

const STEP_SECTIONS = ['core', 'characters', 'locations', 'memories'] as const
type StepSection = typeof STEP_SECTIONS[number]

function sectionForStep(step: number): StepSection | null {
  if (step === 1) return 'core'
  if (step === 2) return 'characters'
  if (step === 3) return 'locations'
  if (step === 4) return 'memories'
  return null
}

interface PreviewPanelProps {
  preview: LivePreview
  genStep: number
  tab: 'write' | 'import'
}

function StoryPreviewPanel({ preview, genStep, tab }: PreviewPanelProps) {
  const activeSection = sectionForStep(genStep)
  const isDone = genStep === 0

  return (
    <div class={f.previewPanel}>
      <div class="text-[10px] tracking-[0.1em] uppercase text-text-muted mb-4">
        {isDone ? 'Story Preview' : tab === 'import' ? 'Extracting…' : 'Generating…'}
      </div>

      {/* Title + pills */}
      {preview.title ? (
        <div class={f.previewFadeIn}>
          <div class="text-[20px] font-bold text-text-primary leading-[1.3] mb-[10px]">
            {preview.title}
          </div>
          {(preview.genres.length > 0 || preview.tone.length > 0) && (
            <div class="flex flex-wrap gap-[5px]">
              {preview.genres.map((g) => (
                <span key={g} class="py-[2px] px-2 text-[10px] rounded-full bg-accent-dim text-accent border border-accent font-medium">{g}</span>
              ))}
              {preview.tone.map((t) => (
                <span key={t} class="py-[2px] px-2 text-[10px] rounded-full bg-bg-tertiary text-text-muted border border-border">{t}</span>
              ))}
            </div>
          )}
        </div>
      ) : (
        activeSection === 'core' && <SkeletonBlock lines={2} />
      )}

      {/* Characters */}
      {(preview.characters.length > 0 || activeSection === 'characters') && (
        <div class="mt-5">
          <div class="text-[10px] font-semibold tracking-[0.06em] uppercase text-text-muted mb-2">Characters</div>
          {preview.characters.map((c) => (
            <PreviewCard key={c.name} icon={c.isUserPersona ? '🧑' : '🎭'} name={c.name} sub={c.role} />
          ))}
          {activeSection === 'characters' && <SkeletonCard />}
        </div>
      )}

      {/* Locations */}
      {(preview.locations.length > 0 || activeSection === 'locations') && (
        <div class="mt-5">
          <div class="text-[10px] font-semibold tracking-[0.06em] uppercase text-text-muted mb-2">Locations</div>
          {preview.locations.map((l) => (
            <PreviewCard key={l.name} icon="📍" name={l.name} sub={l.description.slice(0, 55) + (l.description.length > 55 ? '…' : '')} />
          ))}
          {activeSection === 'locations' && <SkeletonCard />}
        </div>
      )}

      {/* Memories / Backstory */}
      {(preview.memories.length > 0 || activeSection === 'memories') && (
        <div class="mt-5">
          <div class="text-[10px] font-semibold tracking-[0.06em] uppercase text-text-muted mb-2">
            {tab === 'import' ? 'Canon Events' : 'Backstory'}
          </div>
          {preview.memories.map((m, i) => (
            <PreviewCard key={i} icon="🧠" name={m.characterName} sub={m.summary.slice(0, 70) + (m.summary.length > 70 ? '…' : '')} importance={m.importance} />
          ))}
          {activeSection === 'memories' && <SkeletonCard />}
        </div>
      )}
    </div>
  )
}

function PreviewCard({ icon, name, sub, importance }: { icon: string; name: string; sub?: string; importance?: number }) {
  return (
    <div class={f.previewCard}>
      <span class="text-[14px] shrink-0">{icon}</span>
      <div class="flex-1 min-w-0">
        <div class="text-xs font-medium text-text-primary overflow-hidden text-ellipsis whitespace-nowrap">{name}</div>
        {sub && <div class="text-[11px] text-text-muted mt-[1px] leading-[1.4]">{sub}</div>}
      </div>
      {importance !== undefined && (
        <div class="w-7 h-[3px] rounded-full bg-bg-hover shrink-0 self-center">
          <div
            class={importance >= 0.8 ? 'h-full rounded-full bg-accent' : 'h-full rounded-full bg-text-muted'}
            style={{ width: `${importance * 100}%` }}
          />
        </div>
      )}
    </div>
  )
}

function SkeletonBlock({ lines }: { lines: number }) {
  return (
    <div class="flex flex-col gap-1.5">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} class={f.previewSkeleton} style={{ height: i === 0 ? '20px' : '12px', borderRadius: '4px', width: i === 0 ? '70%' : '45%' }} />
      ))}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div class={f.previewSkeleton} style={{ height: '38px', borderRadius: '4px', marginTop: '6px' }} />
  )
}
