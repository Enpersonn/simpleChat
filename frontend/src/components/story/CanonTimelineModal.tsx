import { useState, useEffect, useRef } from 'preact/hooks'
import type { CanonEntry, CharacterMemory, Character, Chat } from '@simplechat/types'
import { useStoriesStore } from '../../store/stories.js'
import { api } from '../../lib/api.js'
import { NewChatModal } from '../chat/NewChatModal.js'
import { useChatsStore } from '../../store/chats.js'
import s from './CanonTimelineModal.module.css'

interface Props {
  storyId: string
  onClose: () => void
}

export function CanonTimelineModal({ storyId, onClose }: Props) {
  const { canonTimeline, characters, stories, reorderCanonTimeline, removeCanonEntry, loadCanonTimeline } = useStoriesStore()
  const { openChat, generateOpener } = useChatsStore()

  const story = stories.find((st) => st.id === storyId)

  const [memoryCache, setMemoryCache] = useState<Record<string, CharacterMemory>>({})
  const [activeCharFilter, setActiveCharFilter] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null)
  const [startChatAnchors, setStartChatAnchors] = useState<Record<string, string> | null>(null)
  const dragOverEntryRef = useRef<string | null>(null)

  useEffect(() => {
    loadCanonTimeline(storyId)
  }, [storyId])

  useEffect(() => {
    if (!canonTimeline) return
    const missing = canonTimeline.entries.filter((e) => !memoryCache[e.memoryId])
    if (missing.length === 0) return
    const charIds = [...new Set(missing.map((e) => e.characterId))]
    charIds.forEach(async (charId) => {
      try {
        const mems = await api.characterMemories.list(storyId, charId)
        setMemoryCache((prev) => {
          const next = { ...prev }
          mems.forEach((m) => { next[m.id] = m })
          return next
        })
      } catch { /* ignore */ }
    })
  }, [canonTimeline])

  const entries = canonTimeline?.entries ?? []
  const charMap = new Map<string, Character>(characters.map((c) => [c.id, c]))

  const visibleEntries = activeCharFilter
    ? entries.filter((e) => e.characterId === activeCharFilter)
    : entries

  const charsInTimeline = [...new Set(entries.map((e) => e.characterId))]
    .map((id) => charMap.get(id))
    .filter((c): c is Character => c !== undefined)

  const computeAnchorsUpTo = (entryId: string): Record<string, string> => {
    const anchors: Record<string, string> = {}
    for (const entry of entries) {
      anchors[entry.characterId] = entry.memoryId
      if (entry.id === entryId) break
    }
    return anchors
  }

  // ─── Drag & Drop ─────────────────────────────────────────────────────────────

  const handleDragStart = (e: DragEvent, entryId: string) => {
    setDraggingId(entryId)
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', entryId)
    }
  }

  const handleDragOver = (e: DragEvent, idx: number) => {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    setDropTargetIdx(idx)
    dragOverEntryRef.current = entries[idx]?.id ?? null
  }

  const handleDrop = async (e: DragEvent, idx: number) => {
    e.preventDefault()
    const draggedId = e.dataTransfer?.getData('text/plain') ?? draggingId
    if (!draggedId) return
    setDraggingId(null)
    setDropTargetIdx(null)

    const currentIds = entries.map((en) => en.id)
    const fromIdx = currentIds.indexOf(draggedId)
    if (fromIdx === idx || fromIdx === -1) return

    const next = [...currentIds]
    next.splice(fromIdx, 1)
    const insertAt = fromIdx < idx ? idx - 1 : idx
    next.splice(insertAt, 0, draggedId)
    await reorderCanonTimeline(storyId, next)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDropTargetIdx(null)
  }

  const handleDelete = async (entryId: string) => {
    if (!confirm('Remove this entry from the canon timeline? The memory itself will not be deleted.')) return
    await removeCanonEntry(storyId, entryId)
  }

  const handleStartChat = (entry: CanonEntry) => {
    const anchors = computeAnchorsUpTo(entry.id)
    setStartChatAnchors(anchors)
  }

  return (
    <>
      <div class={s.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
        <div class={s.modal}>
          <div class={s.header}>
            <div class={s.headerLeft}>
              <span class={s.title}>Canon Timeline</span>
              {story && <span class={s.subtitle}>{story.title}</span>}
            </div>
            <button class={s.closeBtn} onClick={onClose}>✕</button>
          </div>

          {charsInTimeline.length > 0 && (
            <div class={s.toolbar}>
              <span class={s.filterLabel}>Filter</span>
              <button
                class={s.filterPill}
                data-active={activeCharFilter === null ? 'true' : undefined}
                onClick={() => setActiveCharFilter(null)}
              >
                All
              </button>
              {charsInTimeline.map((char) => (
                <button
                  key={char.id}
                  class={s.filterPill}
                  data-active={activeCharFilter === char.id ? 'true' : undefined}
                  onClick={() => setActiveCharFilter(activeCharFilter === char.id ? null : char.id)}
                >
                  {char.name}
                </button>
              ))}
            </div>
          )}

          <div class={s.body}>
            {visibleEntries.length === 0 && (
              <div class={s.emptyState}>
                <span class={s.emptyIcon}>⏱</span>
                <span class={s.emptyText}>
                  {entries.length === 0
                    ? 'No canon memories yet. Import a story with text to extract events automatically, or add memories to characters and add them here.'
                    : 'No events match the current filter.'}
                </span>
              </div>
            )}

            {visibleEntries.length > 0 && (
              <>
                <div class={s.timelineBound}>
                  <span class={s.timelineBoundLine} />
                  <span>Start of Story</span>
                  <span class={s.timelineBoundLine} />
                </div>

                {visibleEntries.map((entry, idx) => {
                  const char = charMap.get(entry.characterId)
                  const memory = memoryCache[entry.memoryId]
                  const isDragging = draggingId === entry.id
                  const isDropTarget = dropTargetIdx === idx && draggingId !== null

                  return (
                    <div
                      key={entry.id}
                      class={s.entryWrapper}
                      onDragOver={(e) => handleDragOver(e as DragEvent, idx)}
                      onDrop={(e) => handleDrop(e as DragEvent, idx)}
                    >
                      <div class={s.entryConnector} data-drop={isDropTarget ? 'true' : undefined} />

                      <div
                        class={s.entryCard}
                        draggable
                        data-dragging={isDragging ? 'true' : undefined}
                        onDragStart={(e) => handleDragStart(e as DragEvent, entry.id)}
                        onDragEnd={handleDragEnd}
                      >
                        <span class={s.dragHandle} title="Drag to reorder">⠿</span>

                        <div class={s.entryContent}>
                          <div class={s.entryMeta}>
                            <span class={s.charIcon}>{char?.isUserPersona ? '🧑' : '🎭'}</span>
                            <span class={s.charName}>{char?.name ?? 'Unknown'}</span>
                            {entry.label && <span class={s.entryLabel}>{entry.label}</span>}
                          </div>

                          {memory ? (
                            <>
                              <div class={s.entrySummary}>{memory.summary}</div>
                              <div class={s.entryFooter}>
                                {memory.tags.slice(0, 4).map((tag) => (
                                  <span key={tag} class={s.tag}>{tag}</span>
                                ))}
                                <div class={s.importanceBar} title={`Importance: ${memory.importance.toFixed(1)}`}>
                                  <div class={s.importanceFill} style={{ width: `${memory.importance * 100}%` }} />
                                </div>
                                <span class={s.importanceVal}>{memory.importance.toFixed(1)}</span>
                              </div>
                            </>
                          ) : (
                            <div class={s.entrySummary} style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                              {entry.label ?? 'Memory not found'}
                            </div>
                          )}
                        </div>

                        <div class={s.entryActions}>
                          <button
                            class={s.startBtn}
                            onClick={() => handleStartChat(entry)}
                            title="Start a new chat from this point in the story"
                          >
                            ▶ Start here
                          </button>
                          <button
                            class={s.deleteBtn}
                            onClick={() => handleDelete(entry.id)}
                            title="Remove from timeline"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}

                <div class={s.entryWrapper} onDragOver={(e) => handleDragOver(e as DragEvent, visibleEntries.length)} onDrop={(e) => handleDrop(e as DragEvent, visibleEntries.length)}>
                  <div class={s.entryConnector} data-drop={dropTargetIdx === visibleEntries.length ? 'true' : undefined} />
                </div>

                <div class={s.timelineBound}>
                  <span class={s.timelineBoundLine} />
                  <span>End of Canon</span>
                  <span class={s.timelineBoundLine} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {startChatAnchors !== null && (
        <NewChatModal
          storyId={storyId}
          initialAnchors={startChatAnchors}
          onClose={() => setStartChatAnchors(null)}
          onCreated={(chat: Chat, openingMode) => {
            setStartChatAnchors(null)
            onClose()
            openChat(storyId, chat.id).then(() => {
              if (openingMode === 'auto') generateOpener(storyId, chat.id)
            })
          }}
        />
      )}
    </>
  )
}
