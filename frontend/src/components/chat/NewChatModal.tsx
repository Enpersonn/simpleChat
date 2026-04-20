import { useState } from 'preact/hooks'
import type { Chat, ChatMode } from '@simplechat/types'
import { useStoriesStore } from '../../store/stories.js'
import { useChatsStore } from '../../store/chats.js'
import { api } from '../../lib/api.js'
import s from '../story/StoryCreateModal.module.css'

type OpeningMode = 'none' | 'story' | 'auto'

interface Props {
  storyId: string
  onClose: () => void
  onCreated: (chat: Chat, openingMode: OpeningMode) => void
}

export function NewChatModal({ storyId, onClose, onCreated }: Props) {
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

  const toggleSpeaker = (id: string) => {
    setSpeakers((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id])
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const chat = await createChat(storyId, mode, speakers)
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

        {characters.filter((c) => !c.isUserPersona).length > 0 && (
          <div class={s.field}>
            <label class={s.label}>Speaking As (Active Characters)</label>
            <div class={s.tagGroup}>
              {characters.filter((c) => !c.isUserPersona).map((char) => (
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
