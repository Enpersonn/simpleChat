import { useEffect } from 'preact/hooks'
import { LeftPanel } from './LeftPanel.js'
import { RightPanel } from './RightPanel.js'
import { ChatWindow } from '../chat/ChatWindow.js'
import { useChatsStore } from '../../store/chats.js'
import { useSettingsStore } from '../../store/settings.js'
import s from './AppLayout.module.css'

export function AppLayout() {
  const activeChatId = useChatsStore((s) => s.activeChatId)
  const checkHealth = useSettingsStore((s) => s.checkHealth)
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const loadModels = useSettingsStore((s) => s.loadModels)

  useEffect(() => {
    loadSettings().then(() => {
      // Check health after settings are loaded so we use the correct endpoint
      checkHealth().then(() => loadModels())
    })
    const interval = setInterval(checkHealth, 30_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div class={s.root}>
      <div class={s.left}>
        <LeftPanel />
      </div>
      <div class={s.main}>
        {activeChatId ? (
          <ChatWindow />
        ) : (
          <div class={s.empty}>
            <h2>SimpleChat</h2>
            <p>Select a story and open a chat to begin your session.</p>
          </div>
        )}
      </div>
      <div class={s.right}>
        <RightPanel />
      </div>
    </div>
  )
}
