import { useState } from 'preact/hooks'
import { marked } from 'marked'
import type { Turn } from '@simplechat/types'
import { useChatsStore } from '../../store/chats.js'
import { useSettingsStore } from '../../store/settings.js'

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

  const rootCls = [
    'flex flex-col gap-1 max-w-[820px] relative group/msg',
    isUser
      ? 'self-end items-end max-w-[680px]'
      : 'self-start items-start',
  ].join(' ')

  const avatarCls = [
    'w-5.5 h-5.5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0',
    isUser ? 'bg-accent-dim text-accent' : 'bg-bg-tertiary text-text-secondary',
  ].join(' ')

  const bubbleCls = [
    'px-4 py-2.5 rounded-lg leading-[1.8] text-[length:var(--bubble-font-size,16px)] break-words relative',
    isUser
      ? 'bg-user-bubble border border-accent-border rounded-br-sm font-ui'
      : 'bg-assistant-bubble border border-border rounded-bl-sm font-reading',
  ].join(' ')

  const actionBtnCls = 'text-[11px] text-text-muted py-0.5 px-1.5 rounded-sm border border-border bg-bg-secondary transition-all duration-150 hover:text-text-primary hover:border-accent'
  const deleteBtnCls = `${actionBtnCls} hover:!text-error hover:!border-error`

  return (
    <div class={rootCls} data-role={turn.role}>
      <div class="flex items-center gap-1.5 px-1">
        <div class={avatarCls}>{initial}</div>
        <span class="text-[11px] font-semibold text-text-muted tracking-[0.02em]">{speakerName}</span>
      </div>

      <div class={bubbleCls}>
        {editing ? (
          <div class="flex flex-col gap-1.5 w-full">
            <textarea
              class="w-full p-2 text-[length:var(--bubble-font-size,16px)] font-ui border border-accent rounded-sm bg-bg-secondary text-text-primary resize-y leading-[1.6]"
              value={editText}
              onInput={(e) => setEditText((e.target as HTMLTextAreaElement).value)}
              rows={Math.max(3, editText.split('\n').length)}
            />
            <div class="flex gap-1.5">
              {isUser && (
                <button type="button" class="text-[11px] py-[3px] px-2.5 rounded-sm border border-accent bg-accent text-text-on-accent font-semibold transition-opacity duration-150 hover:opacity-85" onClick={saveAndResend}>Save & Resend</button>
              )}
              <button type="button" class={isUser ? actionBtnCls : "text-[11px] py-[3px] px-2.5 rounded-sm border border-accent bg-accent text-text-on-accent font-semibold transition-opacity duration-150 hover:opacity-85"} onClick={saveEdit}>Save</button>
              <button type="button" class={actionBtnCls} onClick={cancelEdit}>Cancel</button>
            </div>
          </div>
        ) : (
          <div
            class="md-content"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: markdown rendered locally
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        )}
        {isStreaming && (
          <span class="inline-block w-0.5 h-[1em] bg-accent ml-0.5 align-text-bottom animate-blink" />
        )}
      </div>

      {!isStreaming && !editing && (
        <div class="flex gap-1 py-0.5 px-1 opacity-0 transition-opacity duration-150 group-hover/msg:opacity-100">
          {!isUser && (
            <button type="button" class={actionBtnCls} onClick={handleRegenerate} title="Regenerate response">
              ↻ Regen
            </button>
          )}
          <button type="button" class={actionBtnCls} onClick={startEdit} title="Edit message">
            ✎ Edit
          </button>
          <button
            type="button"
            class={deleteBtnCls}
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
