import { useState, useEffect } from 'preact/hooks'
import type { Chat, ChatMode, CharacterMemory } from '@simplechat/types'
import { useStoriesStore } from '../../store/stories.js'
import { useChatsStore } from '../../store/chats.js'
import { api } from '../../lib/api.js'
import s from '../story/StoryCreateModal.module.css'
import ms from './NewChatModal.module.css'

type OpeningMode = 'none' | 'story' | 'auto'

interface Props {
  storyId: string
  initialAnchors?: Record<string, string>
  onClose: () => void
  onCreated: (chat: Chat, openingMode: OpeningMode) => void
}

export function NewChatModal({ storyId, initialAnchors, onClose, onCreated }: Props) {
  const { characters, stories } = useStoriesStore()
  const createChat = useChatsStore((s) => s.createChat)
  const story = stories.find((s) => s.id === storyId)

  const [title, setTitle] = useState('')
  const [mode, setMode] = useState<ChatMode>('interactive')
  const [speakers, setSpeakers] = useState<string[]>([])
  const [openingMode, setOpeningMode] = useState<OpeningMode>(
    story?.openingMessage ? 'story' : 'none',
  )
  const [customOpening, setCustomOpening] = useState(story?.openingMessage ?? '')
  const [submitting, setSubmitting] = useState(false)

  // Memory anchors: { [charId]: memoryId } — undefined key = use natural head
  const [memoryAnchors, setMemoryAnchors] = useState<Record<string, string>>(initialAnchors ?? {})
  // Memories per char for the picker
  const [charMemories, setCharMemories] = useState<Record<string, CharacterMemory[]>>({})
  const [expandedCharId, setExpandedCharId] = useState<string | null>(null)

  const nonPersonaChars = characters.filter((c) => !c.isUserPersona)

  useEffect(() => {
    // Load memories for all non-persona characters to know which have timelines
    const load = async () => {
      const results: Record<string, CharacterMemory[]> = {}
      await Promise.all(
        nonPersonaChars.map(async (c) => {
          try {
            const mems = await api.characterMemories.list(storyId, c.id)
            if (mems.length > 0) results[c.id] = mems
          } catch { /* ignore */ }
        }),
      )
      setCharMemories(results)
    }
    load()
  }, [storyId])

  const toggleSpeaker = (id: string) => {
    setSpeakers((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id])
  }

  const setAnchor = (charId: string, memoryId: string | null) => {
    setMemoryAnchors((prev) => {
      if (memoryId === null) {
        const next = { ...prev }
        delete next[charId]
        return next
      }
      return { ...prev, [charId]: memoryId }
    })
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const anchorsToPass = Object.keys(memoryAnchors).length > 0 ? memoryAnchors : undefined
      const chat = await createChat(storyId, mode, speakers, anchorsToPass)
      if (openingMode === 'story' && customOpening.trim()) {
        await api.chats.seed(storyId, chat.id, customOpening.trim())
        onCreated(chat, 'none')
      } else {
        onCreated(chat, openingMode)
      }
    } catch {
      setSubmitting(false)
    }
  }

  const charsWithMemories = nonPersonaChars.filter((c) => (charMemories[c.id]?.length ?? 0) > 0)

  return (
    <div class={s.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div class={s.modal} style={{ width: '440px' }}>
        <div class={s.header}>
          <span class={s.title}>New Chat</span>
          <button class={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div class={s.field}>
          <label class={s.label}>Mode</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['interactive', 'storyteller'] as ChatMode[]).map((m) => (
              <button
                key={m}
                class={s.tag}
                data-active={mode === m ? 'true' : undefined}
                onClick={() => setMode(m)}
                style={{ flex: 1, textAlign: 'center' }}
              >
                {m === 'interactive' ? '💬 Interactive RP' : '📝 Storyteller'}
              </button>
            ))}
          </div>
        </div>

        {nonPersonaChars.length > 0 && (
          <div class={s.field}>
            <label class={s.label}>Speaking As (Active Characters)</label>
            <div class={s.tagGroup}>
              {nonPersonaChars.map((char) => (
                <button
                  key={char.id}
                  class={s.tag}
                  data-active={speakers.includes(char.id) ? 'true' : undefined}
                  onClick={() => toggleSpeaker(char.id)}
                >
                  {char.name}{char.role ? ` · ${char.role}` : ''}
                </button>
              ))}
            </div>
          </div>
        )}

        {charsWithMemories.length > 0 && (
          <div class={s.field}>
            <label class={s.label}>Memory Timeline</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {charsWithMemories.map((char) => {
                const mems = charMemories[char.id] ?? []
                const anchor = memoryAnchors[char.id] ?? null
                const anchorMem = anchor ? mems.find((m) => m.id === anchor) : null
                const isExpanded = expandedCharId === char.id
                return (
                  <div key={char.id} class={ms.anchorRow}>
                    <div class={ms.anchorHeader}>
                      <span class={ms.anchorCharName}>{char.name}</span>
                      <div class={ms.anchorBtns}>
                        <button
                          class={ms.anchorBtn}
                          data-active={anchor === null ? 'true' : undefined}
                          onClick={() => { setAnchor(char.id, null); setExpandedCharId(null) }}
                        >
                          Latest
                        </button>
                        <button
                          class={ms.anchorBtn}
                          data-active={isExpanded ? 'true' : undefined}
                          onClick={() => setExpandedCharId(isExpanded ? null : char.id)}
                        >
                          Choose point…
                        </button>
                      </div>
                      {anchorMem && (
                        <span class={ms.anchorBadge} title={anchorMem.summary}>
                          ⚓ {anchorMem.summary.slice(0, 30)}{anchorMem.summary.length > 30 ? '…' : ''}
                        </span>
                      )}
                    </div>
                    {isExpanded && (
                      <div class={ms.anchorList}>
                        {[...mems].reverse().map((m) => (
                          <button
                            key={m.id}
                            class={ms.anchorMemItem}
                            data-active={anchor === m.id ? 'true' : undefined}
                            onClick={() => { setAnchor(char.id, m.id); setExpandedCharId(null) }}
                          >
                            <span class={ms.anchorMemSummary}>{m.summary}</span>
                            {m.tags.length > 0 && (
                              <span class={ms.anchorMemTags}>{m.tags.slice(0, 3).join(', ')}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div class={s.field}>
          <label class={s.label}>Opening Message</label>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
            {(['none', 'story', 'auto'] as OpeningMode[]).map((m) => (
              <button
                key={m}
                class={s.tag}
                data-active={openingMode === m ? 'true' : undefined}
                onClick={() => setOpeningMode(m)}
                style={{ flex: 1, textAlign: 'center' }}
              >
                {m === 'none' ? 'None' : m === 'story' ? 'Story opening' : '✨ Auto-generate'}
              </button>
            ))}
          </div>
          {openingMode === 'story' && (
            <textarea
              class={s.textarea}
              placeholder="Opening message the AI will send first…"
              value={customOpening}
              onInput={(e) => setCustomOpening((e.target as HTMLTextAreaElement).value)}
              style={{ minHeight: '80px' }}
            />
          )}
          {openingMode === 'auto' && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              The AI will generate an opening scene using the story context when the chat starts.
            </div>
          )}
        </div>

        <div class={s.footer}>
          <button class={s.cancelBtn} onClick={onClose}>Cancel</button>
          <button class={s.submitBtn} onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Start Chat'}
          </button>
        </div>
      </div>
    </div>
  )
}
