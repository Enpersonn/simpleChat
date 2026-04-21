import { useState } from 'preact/hooks'
import type { Location, LocationCreate } from '@simplechat/types'
import { useStoriesStore } from '../../store/stories.js'
import { api } from '../../lib/api.js'
import s from './StoryCreateModal.module.css'

interface Props {
  initial?: Location
  onClose: () => void
  onSaved: (location: Location) => void
}

export function LocationModal({ initial, onClose, onSaved }: Props) {
  const { createLocation, updateLocation, selectedStoryId } = useStoriesStore()
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
      const result = await api.locations.generateFields(selectedStoryId, genPrompt.trim())
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
    <div class={s.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class={s.modal} style={{ maxWidth: '600px' }}>
        <div class={s.modalHeader}>
          <h2 class={s.modalTitle}>{isEdit ? 'Edit Location' : 'New Location'}</h2>
          <button class={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* AI generation */}
        <div class={s.genRow}>
          <input
            class={s.genInput}
            placeholder="Describe the location briefly (e.g. a dimly lit tavern with low ceilings)"
            value={genPrompt}
            onInput={(e) => setGenPrompt((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
          />
          <button class={s.genBtn} onClick={handleGenerate} disabled={generating || !genPrompt.trim()}>
            {generating ? '…' : 'Generate'}
          </button>
        </div>

        <div class={s.fields}>
          <label class={s.field}>
            <span class={s.fieldLabel}>Name *</span>
            <input class={s.input} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder="The Rusty Flagon" />
          </label>
          <label class={s.field}>
            <span class={s.fieldLabel}>Description</span>
            <textarea class={s.textarea} value={description} onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)} placeholder="Overview of this location" rows={2} />
          </label>
          <label class={s.field}>
            <span class={s.fieldLabel}>Layout</span>
            <textarea class={s.textarea} value={layout} onInput={(e) => setLayout((e.target as HTMLTextAreaElement).value)} placeholder="Spatial description — size, shape, exits, notable features" rows={2} />
          </label>
          <label class={s.field}>
            <span class={s.fieldLabel}>Lighting</span>
            <input class={s.input} value={lighting} onInput={(e) => setLighting((e.target as HTMLInputElement).value)} placeholder="e.g. Candlelit, warm amber glow from sconces" />
          </label>
          <label class={s.field}>
            <span class={s.fieldLabel}>Atmosphere</span>
            <input class={s.input} value={atmosphere} onInput={(e) => setAtmosphere((e.target as HTMLInputElement).value)} placeholder="e.g. Smoky, intimate, faintly oppressive" />
          </label>
          <label class={s.field}>
            <span class={s.fieldLabel}>Soundscape</span>
            <input class={s.input} value={soundscape} onInput={(e) => setSoundscape((e.target as HTMLInputElement).value)} placeholder="e.g. Muffled conversation, distant dripping water" />
          </label>
          <label class={s.field}>
            <span class={s.fieldLabel}>Smells</span>
            <input class={s.input} value={smells} onInput={(e) => setSmells((e.target as HTMLInputElement).value)} placeholder="e.g. Woodsmoke, tallow, spilled ale" />
          </label>
          <label class={s.field}>
            <span class={s.fieldLabel}>Notes</span>
            <textarea class={s.textarea} value={notes} onInput={(e) => setNotes((e.target as HTMLTextAreaElement).value)} placeholder="Consistency rules: always cold, no windows, ceiling so low tall people duck" rows={2} />
          </label>
          <label class={s.field}>
            <span class={s.fieldLabel}>Tags (comma-separated)</span>
            <input class={s.input} value={tags} onInput={(e) => setTags((e.target as HTMLInputElement).value)} placeholder="tavern, indoor, dark, cramped" />
          </label>
        </div>

        {error && <div class={s.error}>{error}</div>}

        <div class={s.actions}>
          <button class={s.cancelBtn} onClick={onClose}>Cancel</button>
          <button class={s.saveBtn} onClick={handleSubmit} disabled={submitting || !name.trim()}>
            {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Location'}
          </button>
        </div>
      </div>
    </div>
  )
}
