import { useEffect, useRef, useState } from 'preact/hooks'
import { useChatsStore } from '../../store/chats.js'
import { useStoriesStore } from '../../store/stories.js'
import { ChatMessage } from './ChatMessage.js'
import { ChatComposer } from './ChatComposer.js'
import s from './ChatWindow.module.css'

export function ChatWindow() {
  const { activeChatId, activeStoryId, turns, isStreaming, error, chats, lastStateUpdate } = useChatsStore()
  const characters = useStoriesStore((st) => st.characters)
  const messagesRef = useRef<HTMLDivElement>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeChat = chats.find((c) => c.id === activeChatId)

  useEffect(() => {
    const el = messagesRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [turns.length, isStreaming])

  useEffect(() => {
    if (!lastStateUpdate) return
    const name = lastStateUpdate.locationName
    if (name) {
      setToastMsg(`Scene: ${name}`)
      if (toastTimer.current) clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setToastMsg(null), 3000)
    }
  }, [lastStateUpdate])

  const getCharacterName = (speaker: string): string => {
    if (speaker === 'user') return 'You'
    if (speaker === 'narrator') return 'Narrator'
    return characters.find((c) => c.id === speaker)?.name ?? speaker
  }

  return (
    <div class={s.root}>
      <div class={s.header}>
        <span class={s.chatTitle}>
          {activeChat?.title || `Chat ${activeChatId?.slice(0, 6) ?? ''}`}
        </span>
        {activeChat && (
          <span class={s.modeTag} data-mode={activeChat.mode}>
            {activeChat.mode === 'interactive' ? 'Interactive RP' : 'Storyteller'}
          </span>
        )}
      </div>

      {toastMsg && <div class={s.stateToast}>📍 {toastMsg}</div>}
      {error && <div class={s.error}>⚠ {error}</div>}

      <div class={s.messages} ref={messagesRef}>
        {turns.length === 0 && !isStreaming && (
          <div class={s.empty}>Begin your story…</div>
        )}
        {turns.map((turn) => (
          <ChatMessage
            key={turn.id}
            turn={turn}
            speakerName={getCharacterName(turn.speaker)}
            isStreaming={turn.id === 'streaming'}
          />
        ))}
      </div>

      <ChatComposer />
    </div>
  )
}
