import { useEffect, useRef, useState } from 'preact/hooks'
import { marked } from 'marked'
import type { DmProposal, Turn } from '@simplechat/types'
import { api } from '../../lib/api.js'
import { planMessageStream } from '../../lib/stream.js'
import { useStoriesStore } from '../../store/stories.js'
import { useSettingsStore } from '../../store/settings.js'
import { DmProposalCard } from './DmProposalCard.js'

marked.setOptions({ breaks: true })

interface Props {
  storyId: string
}

export function DmChatTab({ storyId }: Props) {
  const [chatId, setChatId] = useState<string | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [pendingProposals, setPendingProposals] = useState<DmProposal[]>([])
  const [acceptingIds, setAcceptingIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)

  const abortRef = useRef<AbortController | null>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const model = useSettingsStore((st) => st.generation.model)
  const { reloadCharacters, reloadLocations, characters } = useStoriesStore()

  useEffect(() => {
    let cancelled = false
    async function init() {
      setLoading(true)
      try {
        const allChats = await api.chats.list(storyId)
        const planChat = allChats.find((c) => c.mode === 'planning')
        if (cancelled) return
        if (planChat) {
          setChatId(planChat.id)
          const history = await api.chats.history(storyId, planChat.id)
          if (!cancelled) setTurns(history)
        } else {
          const created = await api.chats.create(storyId, {
            mode: 'planning',
            title: 'Story Planning',
            activeSpeakers: [],
          })
          if (!cancelled) {
            setChatId(created.id)
            setTurns([])
          }
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    init()
    return () => { cancelled = true }
  }, [storyId])

  useEffect(() => {
    const el = messagesRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns.length, isStreaming, pendingProposals.length])

  const handleSend = async () => {
    if (!chatId || !input.trim() || isStreaming) return
    const text = input.trim()
    setInput('')
    setError(null)
    setPendingProposals([])

    const tempUserTurn: Turn = {
      id: `temp-${Date.now()}`,
      chatId,
      speaker: 'user',
      role: 'user',
      text,
      timestamp: new Date().toISOString(),
      pinned: false,
    }
    const streamingPlaceholder: Turn = {
      id: 'streaming',
      chatId,
      speaker: 'dm',
      role: 'assistant',
      text: '',
      timestamp: new Date().toISOString(),
      pinned: false,
    }
    setTurns((prev) => [...prev, tempUserTurn, streamingPlaceholder])
    setIsStreaming(true)
    setStreamingText('')

    const ac = new AbortController()
    abortRef.current = ac

    let accumulated = ''
    await planMessageStream({
      storyId,
      chatId,
      text,
      model: model || undefined,
      signal: ac.signal,
      onChunk: (chunk) => {
        accumulated += chunk
        setStreamingText(accumulated)
        setTurns((prev) =>
          prev.map((t) => (t.id === 'streaming' ? { ...t, text: accumulated } : t)),
        )
      },
      onProposals: (proposals) => {
        setPendingProposals(proposals)
      },
      onDone: async () => {
        abortRef.current = null
        setIsStreaming(false)
        setStreamingText('')
        try {
          const fresh = await api.chats.history(storyId, chatId)
          setTurns(fresh)
        } catch {
          setTurns((prev) => prev.filter((t) => t.id !== 'streaming'))
        }
      },
      onError: (msg) => {
        abortRef.current = null
        setIsStreaming(false)
        setStreamingText('')
        setError(msg)
        setTurns((prev) =>
          prev.filter((t) => t.id !== 'streaming' && t.id !== tempUserTurn.id),
        )
      },
    })
  }

  const handleStop = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsStreaming(false)
    setStreamingText('')
    setTurns((prev) => prev.filter((t) => t.id !== 'streaming'))
  }

  const handleAccept = async (proposal: DmProposal) => {
    setAcceptingIds((prev) => new Set([...prev, proposal.id]))
    try {
      const d = proposal.entityData
      if (proposal.type === 'character') {
        const pub = (d.public ?? {}) as Record<string, unknown>
        const priv = (d.private ?? {}) as Record<string, unknown>
        await api.characters.create(storyId, {
          name: typeof d.name === 'string' ? d.name : 'Unknown',
          role: typeof d.role === 'string' ? d.role : '',
          public: {
            age: typeof pub.age === 'string' ? pub.age : '',
            gender: typeof pub.gender === 'string' ? pub.gender : '',
            species: typeof pub.species === 'string' ? pub.species : '',
            appearance: typeof pub.appearance === 'string' ? pub.appearance : '',
            personality: Array.isArray(pub.personality) ? (pub.personality as string[]) : [],
            speechStyle: typeof pub.speechStyle === 'string' ? pub.speechStyle : '',
            clothing: typeof pub.clothing === 'string' ? pub.clothing : '',
            reputation: '',
            voiceNotes: '',
          },
          private: {
            trueMotives: typeof priv.trueMotives === 'string' ? priv.trueMotives : '',
            fears: Array.isArray(priv.fears) ? (priv.fears as string[]) : [],
            privateKnowledge: [],
            moralLimits: '',
            hiddenEmotionalState: '',
          },
        })
        await reloadCharacters()
      } else if (proposal.type === 'location') {
        await api.locations.create(storyId, {
          name: typeof d.name === 'string' ? d.name : 'Unknown',
          description: typeof d.description === 'string' ? d.description : undefined,
          layout: typeof d.layout === 'string' ? d.layout : undefined,
          lighting: typeof d.lighting === 'string' ? d.lighting : undefined,
          atmosphere: typeof d.atmosphere === 'string' ? d.atmosphere : undefined,
          soundscape: typeof d.soundscape === 'string' ? d.soundscape : undefined,
          smells: typeof d.smells === 'string' ? d.smells : undefined,
          notes: typeof d.notes === 'string' ? d.notes : undefined,
          tags: Array.isArray(d.tags) ? (d.tags as string[]) : [],
        })
        await reloadLocations()
      } else if (proposal.type === 'memory') {
        const charName = typeof d.characterName === 'string' ? d.characterName : ''
        const char = characters.find(
          (c) => c.name.toLowerCase() === charName.toLowerCase(),
        )
        if (!char) throw new Error(`Character "${charName}" not found in this story`)
        await api.characterMemories.create(storyId, char.id, {
          summary: typeof d.summary === 'string' ? d.summary : '',
          tags: Array.isArray(d.tags) ? (d.tags as string[]) : [],
          importance: typeof d.importance === 'number' ? d.importance : 0.5,
          deltas: { effects: [] },
        })
      }
      setPendingProposals((prev) => prev.filter((p) => p.id !== proposal.id))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setAcceptingIds((prev) => {
        const next = new Set(prev)
        next.delete(proposal.id)
        return next
      })
    }
  }

  const handleDecline = (proposalId: string) => {
    setPendingProposals((prev) => prev.filter((p) => p.id !== proposalId))
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const getSpeakerName = (turn: Turn) => {
    if (turn.role === 'user') return 'You'
    return 'DM'
  }

  if (loading) {
    return (
      <div class="flex items-center justify-center h-[200px] text-[13px] text-text-muted">
        Loading DM Chat…
      </div>
    )
  }

  return (
    <div class="flex flex-col h-[520px] min-h-0">
      {error && (
        <div class="flex items-center justify-between gap-2 py-2 px-3 bg-[#ff444422] border border-error rounded-sm text-xs text-error shrink-0 mb-2">
          <span>⚠ {error}</span>
          <button class="text-error text-sm px-1 shrink-0" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <div class="flex-1 overflow-y-auto flex flex-col gap-3 py-2 min-h-0" ref={messagesRef}>
        {turns.length === 0 && !isStreaming && (
          <div class="flex flex-col items-center justify-center gap-2 h-full text-center text-text-muted px-6">
            <strong class="text-sm text-text-secondary">Story Workshop</strong>
            <p class="text-xs leading-[1.5] max-w-[360px]">Chat with your DM to plan characters, locations, and backstory. Ask for suggestions or describe what you have in mind — the DM will propose additions you can accept directly.</p>
          </div>
        )}
        {turns.map((turn) => (
          <div key={turn.id} class={`flex flex-col gap-1 ${turn.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div class="flex items-center gap-1.5 px-1">
              <span class="text-[11px] font-semibold text-text-muted uppercase tracking-[0.05em]">{getSpeakerName(turn)}</span>
            </div>
            <div
              class={`max-w-[92%] py-[9px] px-[13px] rounded text-[14px] leading-[1.55] text-text-primary break-words ${turn.role === 'user' ? 'bg-accent-dim rounded-br-[3px]' : 'bg-bg-tertiary border border-border-light rounded-bl-[3px]'}`}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: markdown rendered locally
              dangerouslySetInnerHTML={{
                __html: marked.parse(turn.text || (turn.id === 'streaming' ? '…' : '')) as string,
              }}
            />
            {turn.id === 'streaming' && (
              <span class="inline-block w-[2px] h-[1em] bg-text-primary align-text-bottom ml-[2px] animate-[blink_1s_step-end_infinite]" />
            )}
          </div>
        ))}

        {pendingProposals.length > 0 && (
          <div class="flex flex-col gap-2 py-2 pb-1">
            <div class="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted pl-[2px]">Suggestions from DM</div>
            {pendingProposals.map((p) => (
              <DmProposalCard
                key={p.id}
                proposal={p}
                onAccept={() => handleAccept(p)}
                onDecline={() => handleDecline(p.id)}
                isAccepting={acceptingIds.has(p.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div class="flex flex-col gap-1.5 pt-2.5 border-t border-border-light shrink-0 mt-2">
        <textarea
          ref={textareaRef}
          class="w-full resize-none py-[9px] px-3 text-[13px] bg-bg-primary border border-border-light rounded-sm text-text-primary font-[inherit] leading-[1.5] box-border focus:outline-none focus:border-accent disabled:opacity-60 disabled:cursor-not-allowed"
          value={input}
          onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
          onKeyDown={handleKeyDown}
          placeholder="Chat with your DM to plan the story…"
          rows={2}
          disabled={isStreaming}
        />
        <div class="flex justify-end">
          {isStreaming ? (
            <button
              class="py-1.5 px-[18px] text-[13px] font-semibold rounded-sm bg-transparent border border-error text-error transition-colors duration-150 hover:bg-[#ff444422]"
              onClick={handleStop}
            >
              Stop
            </button>
          ) : (
            <button
              class="py-1.5 px-[18px] text-[13px] font-semibold rounded-sm bg-accent text-white transition-opacity duration-150 hover:enabled:opacity-85 disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={handleSend}
              disabled={!input.trim()}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
