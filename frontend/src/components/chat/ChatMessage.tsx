import { useState } from 'preact/hooks'
import { marked } from 'marked'
import type { Turn } from '@simplechat/types'
import { useChatsStore } from '../../store/chats.js'
import { useSettingsStore } from '../../store/settings.js'
import s from './ChatMessage.module.css'

marked.setOptions({ breaks: true })

interface Props {
  turn: Turn
  speakerName: string
  isStreaming: boolean
}

export function ChatMessage({ turn, speakerName, isStreaming }: Props) {
  const deleteTurn = useChatsStore((st) => st.deleteTurn)
  const editTurn = useChatsStore((st) => st.editTurn)
  const editAndResend = useChatsStore((st) => st.editAndResend)
  const regenerate = useChatsStore((st) => st.regenerate)
  const generation = useSettingsStore((st) => st.generation)

  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')

  const isUser = turn.role === 'user'
  const initial = speakerName[0]?.toUpperCase() ?? '?'

  const htmlContent = turn.text
    ? marked.parse(turn.text) as string
    : ''


  const handleRegenerate = () => {
    regenerate({
      moodTags: generation.moodTags,
      responseLength: generation.responseLength,
      feelText: generation.feelText,
      temperature: generation.temperature,
      top_p: generation.top_p,
      top_k: generation.top_k,
      repeat_penalty: generation.repeat_penalty,
      model: generation.model || undefined,
    })
  }

  const startEdit = () => {
    setEditText(turn.text)
    setEditing(true)
  }

  const saveEdit = async () => {
    if (editText.trim()) {
      await editTurn(turn.id, editText.trim())
    }
    setEditing(false)
  }

  const saveAndResend = async () => {
    if (!editText.trim()) return
    setEditing(false)
    await editAndResend(turn.id, editText.trim(), {
      moodTags: generation.moodTags,
      responseLength: generation.responseLength,
      feelText: generation.feelText,
      temperature: generation.temperature,
      top_p: generation.top_p,
      top_k: generation.top_k,
      repeat_penalty: generation.repeat_penalty,
      model: generation.model || undefined,
    })
  }

  const cancelEdit = () => setEditing(false)

  return (
    <div class={s.root} data-role={turn.role}>
      <div class={s.meta}>
        <div class={s.avatar}>{initial}</div>
        <span class={s.name}>{speakerName}</span>
      </div>

      <div class={s.bubble}>
        {editing ? (
          <div class={s.editArea}>
            <textarea
              class={s.editTextarea}
              value={editText}
              onInput={(e) => setEditText((e.target as HTMLTextAreaElement).value)}
              rows={Math.max(3, editText.split('\n').length)}
            />
            <div class={s.editActions}>
              {isUser && (
                <button class={s.editSaveBtn} onClick={saveAndResend}>Save & Resend</button>
              )}
              <button class={isUser ? s.actionBtn : s.editSaveBtn} onClick={saveEdit}>Save</button>
              <button class={s.actionBtn} onClick={cancelEdit}>Cancel</button>
            </div>
          </div>
        ) : (
          <div
            class="md-content"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: markdown rendered locally
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        )}
        {isStreaming && <span class={s.cursor} />}
      </div>

      {!isStreaming && !editing && (
        <div class={s.actions}>
          {!isUser && (
            <button class={s.actionBtn} onClick={handleRegenerate} title="Regenerate response">
              ↻ Regen
            </button>
          )}
          <button class={s.actionBtn} onClick={startEdit} title="Edit message">
            ✎ Edit
          </button>
          <button
            class={`${s.actionBtn} ${s.deleteBtn}`}
            onClick={() => deleteTurn(turn.id)}
            title="Delete message"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
