import { useEffect, useRef, useState } from "preact/hooks";
import { useChatsStore } from "../../store/chats.js";
import { useStoriesStore } from "../../store/stories.js";
import { ConfirmDialog } from "../shared/ConfirmDialog.js";
import { ModeTag } from "../shared/ModeTag.js";
import { ChatComposer } from "./ChatComposer.js";
import { ChatMessage } from "./ChatMessage.js";

export function ChatWindow() {
  const {
    activeChatId,
    activeStoryId,
    turns,
    isStreaming,
    error,
    chats,
    lastStateUpdate,
    updateChat,
    deleteChat,
  } = useChatsStore();
  const characters = useStoriesStore((st) => st.characters);
  const messagesRef = useRef<HTMLDivElement>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeChat = chats.find((c) => c.id === activeChatId);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [turns.length, isStreaming]);

  useEffect(() => {
    if (!lastStateUpdate) return;
    const name = lastStateUpdate.locationName;
    if (name) {
      setToastMsg(`Scene: ${name}`);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToastMsg(null), 3000);
    }
  }, [lastStateUpdate]);

  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  const getCharacterName = (speaker: string): string => {
    if (speaker === "user") return "You";
    if (speaker === "narrator") return "Narrator";
    return characters.find((c) => c.id === speaker)?.name ?? speaker;
  };

  const startTitleEdit = () => {
    setTitleDraft(activeChat?.title ?? "");
    setEditingTitle(true);
    setShowMenu(false);
  };

  const saveTitleEdit = async () => {
    if (!activeChatId || !activeStoryId) return;
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== activeChat?.title) {
      await updateChat(activeStoryId, activeChatId, { title: trimmed });
    }
    setEditingTitle(false);
  };

  const handleDeleteChat = () => {
    if (!activeChatId || !activeStoryId) return;
    setShowMenu(false);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteChat = async () => {
    if (!activeChatId || !activeStoryId) return;
    setShowDeleteConfirm(false);
    await deleteChat(activeStoryId, activeChatId);
  };

  const displayTitle =
    activeChat?.title || `Chat ${activeChatId?.slice(0, 6) ?? ""}`;

  return (
    <div class="flex flex-col h-full overflow-hidden">
      <div class="flex items-center gap-[10px] px-4 py-[10px] border-b border-border shrink-0 bg-bg-secondary">
        {editingTitle ? (
          <input
            class="flex-1 text-[13px] font-medium text-text-primary bg-bg-tertiary border border-accent rounded-sm py-[3px] px-2 min-w-0 outline-none"
            value={titleDraft}
            onInput={(e) => setTitleDraft((e.target as HTMLInputElement).value)}
            onBlur={saveTitleEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveTitleEdit();
              if (e.key === "Escape") setEditingTitle(false);
            }}
          />
        ) : (
          <span
            class="flex-1 text-[13px] font-medium text-text-primary min-w-0 overflow-hidden text-ellipsis whitespace-nowrap cursor-pointer rounded-sm py-0.5 px-1 -my-0.5 -mx-1 transition-colors duration-150 hover:bg-bg-hover"
            onClick={startTitleEdit}
            onKeyDown={(e) => { if (e.key === 'Enter') startTitleEdit() }}
            role="button"
            tabIndex={0}
            title="Click to rename"
          >
            {displayTitle}
          </span>
        )}
        {activeChat && <ModeTag mode={activeChat.mode} long />}
        <div class="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            class="text-sm text-text-muted py-[3px] px-[7px] rounded-sm tracking-[0.05em] transition-colors duration-150 hover:text-text-primary hover:bg-bg-hover"
            onClick={() => setShowMenu((v) => !v)}
            title="Chat options"
          >
            ···
          </button>
          {showMenu && (
            <div class="absolute top-[calc(100%+4px)] right-0 bg-bg-tertiary border border-border-light rounded shadow-lg min-w-[150px] z-50 overflow-hidden">
              <button
                type="button"
                class="block w-full text-left px-3.5 py-2 text-xs text-text-secondary transition-colors duration-100 hover:bg-bg-hover hover:text-text-primary"
                onClick={startTitleEdit}
              >
                ✎ Rename
              </button>
              <button
                type="button"
                class="block w-full text-left px-3.5 py-2 text-xs text-text-secondary transition-colors duration-100 hover:bg-error-dim hover:text-error"
                onClick={handleDeleteChat}
              >
                ✕ Delete chat
              </button>
            </div>
          )}
        </div>
      </div>

      {toastMsg && (
        <div class="mx-4 mt-1.5 px-[10px] py-1.5 bg-accent-dim border border-accent-border rounded-sm text-[11px] text-accent shrink-0 animate-fade-in">
          📍 {toastMsg}
        </div>
      )}
      {error && (
        <div class="mx-4 px-3 py-2 bg-error-dim border border-error-border rounded-sm text-xs text-error shrink-0">
          ⚠ {error}
        </div>
      )}

      <div class="flex-1 overflow-y-auto overflow-x-hidden p-4 flex flex-col gap-3" ref={messagesRef}>
        {turns.length === 0 && !isStreaming && (
          <div class="flex-1 flex items-center justify-center text-text-muted text-[13px] italic">
            Begin your story…
          </div>
        )}
        {turns.map((turn) => (
          <ChatMessage
            key={turn.id}
            turn={turn}
            speakerName={getCharacterName(turn.speaker)}
            isStreaming={turn.id === "streaming"}
          />
        ))}
      </div>

      <ChatComposer />

      {showDeleteConfirm && (
        <ConfirmDialog
          message="Delete this chat and all its messages?"
          onConfirm={confirmDeleteChat}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
