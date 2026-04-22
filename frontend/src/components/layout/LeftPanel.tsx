import { useEffect, useState } from 'preact/hooks'
import { createPortal } from 'preact/compat'
import type { Chat, Character, Location } from '@simplechat/types'
import { useStoriesStore } from '../../store/stories.js'
import { useChatsStore } from '../../store/chats.js'
import { useSettingsStore } from '../../store/settings.js'
import { StoryCreateModal } from '../story/StoryCreateModal.js'
import { EditStoryModal } from '../story/EditStoryModal.js'
import { CharacterModal } from '../story/CharacterModal.js'
import { LocationModal } from '../story/LocationModal.js'
import { NewChatModal } from '../chat/NewChatModal.js'
import { SettingsModal } from '../story/SettingsModal.js'
import { CanonTimelineModal } from '../story/CanonTimelineModal.js'
import s from './LeftPanel.module.css'

export function LeftPanel() {
  const { stories, selectedStoryId, characters, locations, characterMemories, loadStories, selectStory, deleteStory, deleteCharacter, deleteLocation, loadCharacterTimeline, initCharacterGenesis } = useStoriesStore()
  const { chats, activeChatId, loadChats, openChat, createChat, generateOpener } = useChatsStore()
  const ollamaHealthy = useSettingsStore((s) => s.ollamaHealthy)
  const setGeneration = useSettingsStore((s) => s.setGeneration)

  const [showCreateStory, setShowCreateStory] = useState(false)
  const [editingStory, setEditingStory] = useState<string | null>(null)
  const [showNewChat, setShowNewChat] = useState(false)
  const [branchAnchors, setBranchAnchors] = useState<Record<string, string> | null>(null)
  const [editingChar, setEditingChar] = useState<Character | null | 'new' | 'new-persona'>(null)
  const [editingLocation, setEditingLocation] = useState<Location | null | 'new'>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showTimeline, setShowTimeline] = useState(false)
  const [expandedTimeline, setExpandedTimeline] = useState<string | null>(null)

  useEffect(() => { loadStories() }, [])

  useEffect(() => {
    if (selectedStoryId) loadChats(selectedStoryId)
  }, [selectedStoryId])

  const handleStoryClick = async (id: string) => {
    if (id === selectedStoryId) return
    await selectStory(id)
  }

  const handleChatClick = (chat: Chat) => {
    if (!selectedStoryId) return
    if (chat.id === activeChatId) return
    openChat(selectedStoryId, chat.id)
    setGeneration({ responseLength: chat.mode === 'storyteller' ? 'paragraph+' : 'medium' })
  }

  const handleDeleteStory = async (e: MouseEvent, id: string) => {
    e.stopPropagation()
    if (!confirm('Delete this story and all its chats?')) return
    await deleteStory(id)
  }

  const handleDeleteChar = async (e: MouseEvent, charId: string) => {
    e.stopPropagation()
    if (!confirm('Delete this character?')) return
    await deleteCharacter(charId)
  }

  const handleDeleteLocation = async (e: MouseEvent, locationId: string) => {
    e.stopPropagation()
    if (!confirm('Delete this location?')) return
    await deleteLocation(locationId)
  }

  const handleToggleTimeline = async (charId: string) => {
    if (expandedTimeline === charId) {
      setExpandedTimeline(null)
      return
    }
    setExpandedTimeline(charId)
    if (!characterMemories[charId]) {
      await loadCharacterTimeline(charId)
    }
  }

  const handleBranchFromMemory = (charId: string, memoryId: string) => {
    setBranchAnchors({ [charId]: memoryId })
    setShowNewChat(true)
  }

  const handleInitGenesis = async (e: MouseEvent, charId: string) => {
    e.stopPropagation()
    await initCharacterGenesis(charId)
  }

  const selectedStory = stories.find((s) => s.id === selectedStoryId)
  const storyChats = chats.filter((c) => c.storyId === selectedStoryId)

  return (
    <div class={s.root}>
      <div class={s.header}>
        <span class={s.logo}>SimpleChat</span>
        <span
          class={s.health}
          data-ok={ollamaHealthy === true ? 'true' : ollamaHealthy === false ? 'false' : undefined}
          title={ollamaHealthy === true ? 'Ollama connected' : ollamaHealthy === false ? 'Ollama unreachable' : 'Checking…'}
        />
      </div>

      <div class={s.scroll}>
        {/* Stories */}
        <div class={s.section}>
          <div class={s.sectionHeader}>
            <span class={s.sectionLabel}>Stories</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {selectedStoryId && (
                <button class={s.addBtn} onClick={() => setShowTimeline(true)} title="Canon Timeline" style={{ fontSize: '13px' }}>⏱</button>
              )}
              <button class={s.addBtn} onClick={() => setShowCreateStory(true)} title="New story">+</button>
            </div>
          </div>
          {stories.length === 0 && <div class={s.empty}>No stories yet</div>}
          {stories.map((story) => (
            <div
              key={story.id}
              class={s.item}
              data-active={story.id === selectedStoryId ? 'true' : undefined}
              onClick={() => handleStoryClick(story.id)}
            >
              <span class={s.itemIcon}>📖</span>
              <span class={s.itemLabel} title={story.title}>{story.title}</span>
              <div class={s.itemActions}>
                <button
                  class={s.iconBtn}
                  onClick={(e) => { e.stopPropagation(); setEditingStory(story.id) }}
                  title="Edit story"
                >✎</button>
                <button
                  class={s.iconBtn}
                  onClick={(e) => handleDeleteStory(e, story.id)}
                  title="Delete story"
                >✕</button>
              </div>
            </div>
          ))}
        </div>

        {/* Chats */}
        {selectedStoryId && (
          <div class={s.section}>
            <div class={s.sectionHeader}>
              <span class={s.sectionLabel}>Chats</span>
              <button class={s.addBtn} onClick={() => setShowNewChat(true)} title="New chat">+</button>
            </div>
            {storyChats.length === 0 && <div class={s.empty}>No chats yet</div>}
            {storyChats.map((chat) => (
              <div
                key={chat.id}
                class={`${s.item} ${s.subItem}`}
                data-active={chat.id === activeChatId ? 'true' : undefined}
                onClick={() => handleChatClick(chat)}
              >
                <span class={s.itemIcon}>{chat.mode === 'storyteller' ? '📝' : '💬'}</span>
                <span class={s.itemLabel} title={chat.title || `Chat ${chat.id.slice(0, 6)}`}>
                  {chat.title || `Chat ${chat.id.slice(0, 6)}`}
                </span>
                <span class={s.modeTag} data-mode={chat.mode}>{chat.mode === 'interactive' ? 'RP' : 'Story'}</span>
              </div>
            ))}
          </div>
        )}

        {/* Player Personas */}
        {selectedStoryId && (
          <div class={s.section}>
            <div class={s.sectionHeader}>
              <span class={s.sectionLabel}>Your Persona</span>
              <button class={s.addBtn} onClick={() => setEditingChar('new-persona')} title="New persona">+</button>
            </div>
            {characters.filter((c) => c.isUserPersona).length === 0 && (
              <div class={s.empty}>No persona yet — add one to define your character</div>
            )}
            {characters.filter((c) => c.isUserPersona).map((char) => (
              <div key={char.id} class={`${s.item} ${s.subItem}`}>
                <span class={s.itemIcon}>🧑</span>
                <span class={s.itemLabel} title={char.name}>{char.name}</span>
                {char.role && <span class={s.roleTag}>{char.role}</span>}
                <div class={s.itemActions}>
                  <button class={s.iconBtn} onClick={(e) => { e.stopPropagation(); setEditingChar(char) }} title="Edit persona">✎</button>
                  <button class={s.iconBtn} onClick={(e) => handleDeleteChar(e, char.id)} title="Delete persona">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* AI Characters */}
        {selectedStoryId && (
          <div class={s.section}>
            <div class={s.sectionHeader}>
              <span class={s.sectionLabel}>Characters</span>
              <button class={s.addBtn} onClick={() => setEditingChar('new')} title="New character">+</button>
            </div>
            {characters.filter((c) => !c.isUserPersona).length === 0 && (
              <div class={s.empty}>No characters yet</div>
            )}
            {characters.filter((c) => !c.isUserPersona).map((char) => (
              <div key={char.id}>
                <div class={`${s.item} ${s.subItem}`}>
                  <span class={s.itemIcon}>🎭</span>
                  <span class={s.itemLabel} title={char.name}>{char.name}</span>
                  {char.role && <span class={s.roleTag}>{char.role}</span>}
                  <div class={s.itemActions}>
                    <button
                      type="button"
                      class={s.iconBtn}
                      data-active={expandedTimeline === char.id ? 'true' : undefined}
                      onClick={(e) => { e.stopPropagation(); handleToggleTimeline(char.id) }}
                      title="Character timeline"
                    >⏱</button>
                    <button type="button" class={s.iconBtn} onClick={(e) => { e.stopPropagation(); setEditingChar(char) }} title="Edit character">✎</button>
                    <button type="button" class={s.iconBtn} onClick={(e) => handleDeleteChar(e, char.id)} title="Delete character">✕</button>
                  </div>
                </div>
                {expandedTimeline === char.id && (
                  <div class={s.timeline}>
                    {!char.genesisMemoryId && (
                      <button type="button" class={s.timelineInitBtn} onClick={(e) => handleInitGenesis(e, char.id)}>
                        Initialize timeline from traits
                      </button>
                    )}
                    {(characterMemories[char.id] ?? []).length === 0 && char.genesisMemoryId && (
                      <div class={s.empty}>No memories yet</div>
                    )}
                    {[...(characterMemories[char.id] ?? [])]
                      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                      .map((mem) => {
                        const locName = mem.locationId
                          ? locations.find((l) => l.id === mem.locationId)?.name
                          : undefined
                        return (
                          <div key={mem.id} class={s.timelineEntry}>
                            <span class={s.timelineDot} title={mem.importance >= 0.8 ? 'High importance' : 'Normal'}>
                              {mem.importance >= 0.8 ? '●' : '○'}
                            </span>
                            <span class={s.timelineSummary} title={mem.summary}>
                              {mem.summary.length > 72 ? `${mem.summary.slice(0, 69)}…` : mem.summary}
                            </span>
                            {locName && (
                              <span class={s.roleTag} title={`Location: ${locName}`}>📍{locName}</span>
                            )}
                            <button
                              type="button"
                              class={s.branchBtn}
                              onClick={() => handleBranchFromMemory(char.id, mem.id)}
                              title="Start a new chat from this point in the timeline"
                            >
                              Branch
                            </button>
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Locations */}
        {selectedStoryId && (
          <div class={s.section}>
            <div class={s.sectionHeader}>
              <span class={s.sectionLabel}>Locations</span>
              <button class={s.addBtn} onClick={() => setEditingLocation('new')} title="New location">+</button>
            </div>
            {locations.length === 0 && (
              <div class={s.empty}>No locations yet</div>
            )}
            {locations.map((loc) => (
              <div key={loc.id} class={`${s.item} ${s.subItem}`}>
                <span class={s.itemIcon}>📍</span>
                <span class={s.itemLabel} title={loc.name}>{loc.name}</span>
                <div class={s.itemActions}>
                  <button class={s.iconBtn} onClick={(e) => { e.stopPropagation(); setEditingLocation(loc) }} title="Edit location">✎</button>
                  <button class={s.iconBtn} onClick={(e) => handleDeleteLocation(e, loc.id)} title="Delete location">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div class={s.footer}>
        <button class={s.settingsBtn} onClick={() => setShowSettings(true)}>⚙ Settings</button>
      </div>

      {/* Modals — rendered via portal to escape overflow:hidden on the left panel */}
      {showCreateStory && createPortal(
        <StoryCreateModal
          onClose={() => setShowCreateStory(false)}
          onCreated={(story) => {
            setShowCreateStory(false)
            selectStory(story.id)
          }}
        />,
        document.body
      )}

      {editingStory && selectedStory && editingStory === selectedStory.id && createPortal(
        <EditStoryModal
          story={selectedStory}
          onClose={() => setEditingStory(null)}
          onSaved={() => setEditingStory(null)}
        />,
        document.body
      )}

      {(editingChar === 'new' || editingChar === 'new-persona') && createPortal(
        <CharacterModal
          defaultIsPersona={editingChar === 'new-persona'}
          onClose={() => setEditingChar(null)}
          onSaved={() => setEditingChar(null)}
        />,
        document.body
      )}

      {editingChar && editingChar !== 'new' && editingChar !== 'new-persona' && createPortal(
        <CharacterModal
          initial={editingChar}
          onClose={() => setEditingChar(null)}
          onSaved={() => setEditingChar(null)}
        />,
        document.body
      )}

      {showNewChat && selectedStoryId && createPortal(
        <NewChatModal
          storyId={selectedStoryId}
          initialAnchors={branchAnchors ?? undefined}
          onClose={() => { setShowNewChat(false); setBranchAnchors(null) }}
          onCreated={(chat, openingMode) => {
            setShowNewChat(false)
            setBranchAnchors(null)
            openChat(selectedStoryId, chat.id).then(() => {
              if (openingMode === 'auto') generateOpener(selectedStoryId, chat.id)
            })
            loadChats(selectedStoryId)
          }}
        />,
        document.body
      )}

      {editingLocation === 'new' && createPortal(
        <LocationModal
          onClose={() => setEditingLocation(null)}
          onSaved={() => setEditingLocation(null)}
        />,
        document.body
      )}

      {editingLocation && editingLocation !== 'new' && createPortal(
        <LocationModal
          initial={editingLocation}
          onClose={() => setEditingLocation(null)}
          onSaved={() => setEditingLocation(null)}
        />,
        document.body
      )}

      {showSettings && createPortal(
        <SettingsModal onClose={() => setShowSettings(false)} />,
        document.body
      )}

      {showTimeline && selectedStoryId && createPortal(
        <CanonTimelineModal
          storyId={selectedStoryId}
          onClose={() => setShowTimeline(false)}
        />,
        document.body
      )}
    </div>
  )
}
