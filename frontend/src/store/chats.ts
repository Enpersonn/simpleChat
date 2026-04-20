import { create } from 'zustand'
import type { Chat, Turn, ChatMode } from '@simplechat/types'
import { api } from '../lib/api.js'
import { sendMessageStream, regenerateStream, openerStream, type DebugInfo } from '../lib/stream.js'

interface StreamingState {
  isStreaming: boolean
  streamingText: string
  abortController: AbortController | null
}

interface ChatsState extends StreamingState {
  chats: Chat[]
  activeChatId: string | null
  activeStoryId: string | null
  turns: Turn[]
  error: string | null
  debugInfo: DebugInfo | null

  loadChats: (storyId: string) => Promise<void>
  openChat: (storyId: string, chatId: string) => Promise<void>
  createChat: (storyId: string, mode: ChatMode, activeSpeakers?: string[]) => Promise<Chat>
  sendMessage: (params: SendParams) => Promise<void>
  regenerate: (params: RegenerateParams) => Promise<void>
  editAndResend: (turnId: string, text: string, params: RegenerateParams) => Promise<void>
  generateOpener: (storyId: string, chatId: string) => Promise<void>
  stopStream: () => void
  deleteTurn: (turnId: string) => Promise<void>
  editTurn: (turnId: string, text: string) => Promise<void>
}

interface SendParams {
  text: string
  speaker?: string
  moodTags?: string[]
  responseLength?: string
  feelText?: string
  temperature?: number
  top_p?: number
  top_k?: number
  repeat_penalty?: number
  model?: string
}

interface RegenerateParams {
  moodTags?: string[]
  responseLength?: string
  feelText?: string
  temperature?: number
  top_p?: number
  top_k?: number
  repeat_penalty?: number
  model?: string
}

export const useChatsStore = create<ChatsState>((set, get) => ({
  chats: [],
  activeChatId: null,
  activeStoryId: null,
  turns: [],
  isStreaming: false,
  streamingText: '',
  abortController: null,
  error: null,
  debugInfo: null,

  loadChats: async (storyId: string) => {
    const chats = await api.chats.list(storyId)
    set({ chats })
  },

  openChat: async (storyId: string, chatId: string) => {
    set({ activeChatId: chatId, activeStoryId: storyId, turns: [], error: null, debugInfo: null })
    const turns = await api.chats.history(storyId, chatId)
    set({ turns })
  },

  createChat: async (storyId: string, mode: ChatMode, activeSpeakers: string[] = []) => {
    const chat = await api.chats.create(storyId, { mode, activeSpeakers })
    set((s) => ({ chats: [chat, ...s.chats] }))
    return chat
  },

  sendMessage: async (params: SendParams) => {
    const { activeChatId, activeStoryId, isStreaming } = get()
    if (!activeChatId || !activeStoryId || isStreaming) return

    const userTurn: Turn = {
      id: `temp-${Date.now()}`,
      chatId: activeChatId,
      speaker: params.speaker ?? 'user',
      role: 'user',
      text: params.text,
      timestamp: new Date().toISOString(),
      pinned: false,
    }

    const streamingPlaceholder: Turn = {
      id: 'streaming',
      chatId: activeChatId,
      speaker: 'assistant',
      role: 'assistant',
      text: '',
      timestamp: new Date().toISOString(),
      pinned: false,
    }

    set((s) => ({
      turns: [...s.turns, userTurn, streamingPlaceholder],
      isStreaming: true,
      streamingText: '',
      error: null,
    }))

    const ac = new AbortController()
    set({ abortController: ac })

    await sendMessageStream({
      storyId: activeStoryId,
      chatId: activeChatId,
      body: params,
      signal: ac.signal,
      onDebug: (info) => set({ debugInfo: info }),
      onChunk: (text) => {
        set((s) => ({
          streamingText: s.streamingText + text,
          turns: s.turns.map((t) =>
            t.id === 'streaming' ? { ...t, text: s.streamingText + text } : t,
          ),
        }))
      },
      onDone: () => {
        const { activeStoryId: sid, activeChatId: cid } = get()
        if (sid && cid) {
          api.chats.history(sid, cid).then((turns) => {
            set({ turns, isStreaming: false, streamingText: '', abortController: null })
          })
        } else {
          set((s) => ({
            isStreaming: false,
            streamingText: '',
            abortController: null,
            turns: s.turns.filter((t) => t.id !== 'streaming'),
          }))
        }
      },
      onError: (msg) => {
        set((s) => ({
          isStreaming: false,
          streamingText: '',
          abortController: null,
          error: msg,
          turns: s.turns.filter((t) => t.id !== 'streaming' && t.id !== userTurn.id),
        }))
      },
    })
  },

  regenerate: async (params: RegenerateParams) => {
    const { activeChatId, activeStoryId, isStreaming, turns } = get()
    if (!activeChatId || !activeStoryId || isStreaming) return

    const lastAsst = [...turns].reverse().find((t) => t.role === 'assistant')
    if (!lastAsst) return

    const streamingPlaceholder: Turn = {
      id: 'streaming',
      chatId: activeChatId,
      speaker: lastAsst.speaker,
      role: 'assistant',
      text: '',
      timestamp: new Date().toISOString(),
      pinned: false,
    }

    set((s) => ({
      turns: [...s.turns.filter((t) => t.id !== lastAsst.id), streamingPlaceholder],
      isStreaming: true,
      streamingText: '',
      error: null,
    }))

    const ac = new AbortController()
    set({ abortController: ac })

    await regenerateStream({
      storyId: activeStoryId,
      chatId: activeChatId,
      body: params,
      signal: ac.signal,
      onDebug: (info) => set({ debugInfo: info }),
      onChunk: (text) => {
        set((s) => ({
          streamingText: s.streamingText + text,
          turns: s.turns.map((t) =>
            t.id === 'streaming' ? { ...t, text: s.streamingText + text } : t,
          ),
        }))
      },
      onDone: () => {
        const { activeStoryId: sid, activeChatId: cid } = get()
        if (sid && cid) {
          api.chats.history(sid, cid).then((turns) => {
            set({ turns, isStreaming: false, streamingText: '', abortController: null })
          })
        }
      },
      onError: (msg) => {
        set({ isStreaming: false, streamingText: '', abortController: null, error: msg })
      },
    })
  },

  editAndResend: async (turnId: string, text: string, params: RegenerateParams) => {
    const { activeChatId, activeStoryId, isStreaming, turns } = get()
    if (!activeChatId || !activeStoryId || isStreaming) return
    try {
      await api.chats.editTurn(activeStoryId, activeChatId, turnId, text)
      await api.chats.deleteAfterTurn(activeStoryId, activeChatId, turnId)

      const turnIdx = turns.findIndex((t) => t.id === turnId)
      const prunedTurns = turns
        .slice(0, turnIdx + 1)
        .map((t) => (t.id === turnId ? { ...t, text } : t))

      const lastAsst = [...turns].reverse().find((t) => t.role === 'assistant')
      const streamingPlaceholder: Turn = {
        id: 'streaming',
        chatId: activeChatId,
        speaker: lastAsst?.speaker ?? 'assistant',
        role: 'assistant',
        text: '',
        timestamp: new Date().toISOString(),
        pinned: false,
      }

      const ac = new AbortController()
      set({
        turns: [...prunedTurns, streamingPlaceholder],
        isStreaming: true,
        streamingText: '',
        error: null,
        abortController: ac,
      })

      await regenerateStream({
        storyId: activeStoryId,
        chatId: activeChatId,
        body: params,
        signal: ac.signal,
        onDebug: (info) => set({ debugInfo: info }),
        onChunk: (chunk) => {
          set((s) => ({
            streamingText: s.streamingText + chunk,
            turns: s.turns.map((t) =>
              t.id === 'streaming' ? { ...t, text: s.streamingText + chunk } : t,
            ),
          }))
        },
        onDone: () => {
          const { activeStoryId: sid, activeChatId: cid } = get()
          if (sid && cid) {
            api.chats.history(sid, cid).then((freshTurns) => {
              set({ turns: freshTurns, isStreaming: false, streamingText: '', abortController: null })
            })
          }
        },
        onError: (msg) => {
          set({ isStreaming: false, streamingText: '', abortController: null, error: msg })
        },
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to resend' })
    }
  },

  generateOpener: async (storyId: string, chatId: string) => {
    const { isStreaming } = get()
    if (isStreaming) return

    const streamingPlaceholder: Turn = {
      id: 'streaming',
      chatId,
      speaker: 'assistant',
      role: 'assistant',
      text: '',
      timestamp: new Date().toISOString(),
      pinned: false,
    }
    const ac = new AbortController()
    set({ turns: [streamingPlaceholder], isStreaming: true, streamingText: '', error: null, abortController: ac })

    await openerStream(storyId, chatId, {
      signal: ac.signal,
      onDebug: (info) => set({ debugInfo: info }),
      onChunk: (text) => {
        set((s) => ({
          streamingText: s.streamingText + text,
          turns: s.turns.map((t) => t.id === 'streaming' ? { ...t, text: s.streamingText + text } : t),
        }))
      },
      onDone: () => {
        api.chats.history(storyId, chatId).then((turns) => {
          set({ turns, isStreaming: false, streamingText: '', abortController: null })
        })
      },
      onError: (msg) => {
        set((s) => ({
          isStreaming: false, streamingText: '', abortController: null, error: msg,
          turns: s.turns.filter((t) => t.id !== 'streaming'),
        }))
      },
    })
  },

  stopStream: () => {
    const { abortController } = get()
    abortController?.abort()
    set((s) => ({
      isStreaming: false,
      abortController: null,
      turns: s.turns.filter((t) => t.id !== 'streaming'),
    }))
  },

  deleteTurn: async (turnId: string) => {
    const { activeChatId, activeStoryId } = get()
    if (!activeChatId || !activeStoryId) return
    try {
      await api.chats.deleteTurn(activeStoryId, activeChatId, turnId)
      set((s) => ({ turns: s.turns.filter((t) => t.id !== turnId) }))
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete message' })
    }
  },

  editTurn: async (turnId: string, text: string) => {
    const { activeChatId, activeStoryId } = get()
    if (!activeChatId || !activeStoryId) return
    try {
      const updated = await api.chats.editTurn(activeStoryId, activeChatId, turnId, text)
      set((s) => ({ turns: s.turns.map((t) => (t.id === turnId ? updated : t)) }))
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to edit message' })
    }
  },
}))
