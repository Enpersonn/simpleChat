import { useEffect } from "preact/hooks";
import { useChatsStore } from "../../store/chats.js";
import { useSettingsStore } from "../../store/settings.js";
import { ChatWindow } from "../chat/ChatWindow.js";
import s from "./AppLayout.module.css";
import { LeftPanel } from "./LeftPanel.js";
import { RightPanel } from "./RightPanel.js";

export function AppLayout() {
  const activeChatId = useChatsStore((s) => s.activeChatId);
  const checkHealth = useSettingsStore((s) => s.checkHealth);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const loadModels = useSettingsStore((s) => s.loadModels);
  const fontSize = useSettingsStore((s) => s.appSettings.fontSize);
  const theme = useSettingsStore((s) => s.appSettings.theme);

  useEffect(() => {
    loadSettings().then(() => {
      checkHealth().then(() => loadModels());
    });
    const interval = setInterval(checkHealth, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--bubble-font-size",
      `${fontSize}px`,
    );
  }, [fontSize]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

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
  );
}
