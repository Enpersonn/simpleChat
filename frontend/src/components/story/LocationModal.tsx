import { useState } from 'preact/hooks'
import type { StoryLocation as Location, LocationCreate } from '@simplechat/types'
import { useStoriesStore } from '../../store/stories.js'
import { api } from '../../lib/api.js'
import { f } from '../shared/formCls.js'

interface Props {
  initial?: Location
  onClose: () => void
  onSaved: (location: Location) => void
}

export function LocationModal({ initial, onClose, onSaved }: Props) {
  const { createLocation, updateLocation, selectedStoryId, stories } = useStoriesStore()
  const isEdit = !!initial

  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [layout, setLayout] = useState(initial?.layout ?? '')
  const [lighting, setLighting] = useState(initial?.lighting ?? '')
  const [atmosphere, setAtmosphere] = useState(initial?.atmosphere ?? '')
  const [soundscape, setSoundscape] = useState(initial?.soundscape ?? '')
  const [smells, setSmells] = useState(initial?.smells ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '))
  const [genPrompt, setGenPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const toArray = (str: string) => str.split(',').map((x) => x.trim()).filter(Boolean)

  const handleGenerate = async () => {
    if (!genPrompt.trim() || !selectedStoryId || generating) return
    setGenerating(true)
    setError('')
    try {
      const selectedStory = stories.find((s) => s.id === selectedStoryId)
      const storyContext = selectedStory
        ? `Story: "${selectedStory.title}"${selectedStory.premise ? `\nPremise: ${selectedStory.premise}` : ''}`
        : undefined
      const result = await api.ai.generate<{
        name: string; description: string; layout: string; lighting: string
        atmosphere: string; soundscape: string; smells: string; notes: string; tags: string[]
      }>('location', genPrompt.trim(), { storyContext })
      if (result.name) setName(result.name)
      if (result.description) setDescription(result.description)
      if (result.layout) setLayout(result.layout)
      if (result.lighting) setLighting(result.lighting)
      if (result.atmosphere) setAtmosphere(result.atmosphere)
      if (result.soundscape) setSoundscape(result.soundscape)
      if (result.smells) setSmells(result.smells)
      if (result.notes) setNotes(result.notes)
      if (result.tags.length) setTags(result.tags.join(', '))
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
    const data: LocationCreate = {
      name: name.trim(),
      description: description.trim(),
      layout: layout.trim(),
      lighting: lighting.trim(),
      atmosphere: atmosphere.trim(),
      soundscape: soundscape.trim(),
      smells: smells.trim(),
      notes: notes.trim(),
      tags: toArray(tags),
    }
    try {
      let location: Location
      if (isEdit) {
        location = await updateLocation(initial!.id, data)
      } else {
        location = await createLocation(data)
      }
      onSaved(location)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div class={f.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class={f.modalLg}>
        <div class={f.header}>
          <h2 class={f.title}>{isEdit ? 'Edit Location' : 'New Location'}</h2>
          <button class={f.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* AI generation */}
        <div class={f.generateSection}>
          <div class={f.generateRow}>
            <input
              class={f.input}
              placeholder="Describe the location briefly (e.g. a dimly lit tavern with low ceilings)"
              value={genPrompt}
              onInput={(e) => setGenPrompt((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            />
            <button class={f.generateBtn} onClick={handleGenerate} disabled={generating || !genPrompt.trim()}>
              {generating ? '…' : 'Generate'}
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-4.5">
          <div class={f.field}>
            <label class={f.label}>Name <span class={f.required}>*</span></label>
            <input class={f.input} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder="The Rusty Flagon" />
          </div>
          <div class={f.field}>
            <label class={f.label}>Description</label>
            <textarea class={f.textarea} value={description} onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)} placeholder="Overview of this location" style={{ minHeight: '56px' }} />
          </div>
          <div class={f.field}>
            <label class={f.label}>Layout</label>
            <textarea class={f.textarea} value={layout} onInput={(e) => setLayout((e.target as HTMLTextAreaElement).value)} placeholder="Spatial description — size, shape, exits, notable features" style={{ minHeight: '56px' }} />
          </div>
          <div class={f.field}>
            <label class={f.label}>Lighting</label>
            <input class={f.input} value={lighting} onInput={(e) => setLighting((e.target as HTMLInputElement).value)} placeholder="e.g. Candlelit, warm amber glow from sconces" />
          </div>
          <div class={f.field}>
            <label class={f.label}>Atmosphere</label>
            <input class={f.input} value={atmosphere} onInput={(e) => setAtmosphere((e.target as HTMLInputElement).value)} placeholder="e.g. Smoky, intimate, faintly oppressive" />
          </div>
          <div class={f.field}>
            <label class={f.label}>Soundscape</label>
            <input class={f.input} value={soundscape} onInput={(e) => setSoundscape((e.target as HTMLInputElement).value)} placeholder="e.g. Muffled conversation, distant dripping water" />
          </div>
          <div class={f.field}>
            <label class={f.label}>Smells</label>
            <input class={f.input} value={smells} onInput={(e) => setSmells((e.target as HTMLInputElement).value)} placeholder="e.g. Woodsmoke, tallow, spilled ale" />
          </div>
          <div class={f.field}>
            <label class={f.label}>Notes</label>
            <textarea class={f.textarea} value={notes} onInput={(e) => setNotes((e.target as HTMLTextAreaElement).value)} placeholder="Consistency rules: always cold, no windows, ceiling so low tall people duck" style={{ minHeight: '56px' }} />
          </div>
          <div class={f.field}>
            <label class={f.label}>Tags <span class={f.labelHint}>(comma-separated)</span></label>
            <input class={f.input} value={tags} onInput={(e) => setTags((e.target as HTMLInputElement).value)} placeholder="tavern, indoor, dark, cramped" />
          </div>
        </div>

        {error && <p class={f.errorMsg}>{error}</p>}

        <div class={f.footer}>
          <button class={f.cancelBtn} onClick={onClose}>Cancel</button>
          <button class={f.submitBtn} onClick={handleSubmit} disabled={submitting || !name.trim()}>
            {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Location'}
          </button>
        </div>
      </div>
    </div>
  )
}
