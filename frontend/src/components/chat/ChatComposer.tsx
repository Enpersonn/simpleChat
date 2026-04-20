import { useState, useRef } from 'preact/hooks'
import { useChatsStore } from '../../store/chats.js'
import { useSettingsStore } from '../../store/settings.js'
import s from './ChatComposer.module.css'

export function ChatComposer() {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { sendMessage, stopStream, isStreaming, chats, activeChatId } = useChatsStore()
  const generation = useSettingsStore((s) => s.generation)
  const ollamaHealthy = useSettingsStore((s) => s.ollamaHealthy)

  const activeChat = chats.find((c) => c.id === activeChatId)
  const isStoryteller = activeChat?.mode === 'storyteller'
  const offline = ollamaHealthy === false

  const handleSend = async () => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming || offline) return
    setText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    await sendMessage({
      text: trimmed,
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

  const handleContinue = () => {
    if (offline) return
    sendMessage({
      text: 'Continue the story.',
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

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: Event) => {
    const el = e.target as HTMLTextAreaElement
    setText(el.value)
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  return (
    <div class={s.root}>
      {offline && (
        <div class={s.offlineWarning}>
          ⚠ Ollama is unreachable — check that it is running and the endpoint is correct in Settings.
        </div>
      )}
      {isStoryteller && !isStreaming && !offline && (
        <button class={s.continueBtn} onClick={handleContinue}>
          ▶ Continue story
        </button>
      )}
      <div class={s.row}>
        <textarea
          ref={textareaRef}
          class={s.textarea}
          value={text}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={
            offline
              ? 'Ollama is not running…'
              : isStoryteller
              ? 'Steer the story… (or use Continue above)'
              : 'Type your message… (Enter to send, Shift+Enter for newline)'
          }
          disabled={isStreaming || offline}
          rows={1}
        />
        {isStreaming ? (
          <button class={s.stopBtn} onClick={stopStream} title="Stop generation">■</button>
        ) : (
          <button class={s.sendBtn} onClick={handleSend} disabled={!text.trim() || offline} title="Send">➤</button>
        )}
      </div>
    </div>
  )
}
