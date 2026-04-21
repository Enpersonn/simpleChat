import { readFile, writeFile, mkdir, readdir, rm, appendFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  StorySchema,
  CharacterSchema,
  ChatSchema,
  TurnSchema,
  MemoryItemSchema,
  LocationSchema,
  CharacterMemorySchema,
  ChatEntityStateSchema,
  CanonTimelineSchema,
  CanonEntrySchema,
  type Story,
  type StoryCreate,
  type StoryUpdate,
  type Character,
  type CharacterCreate,
  type CharacterUpdate,
  type Chat,
  type ChatCreate,
  type Turn,
  type MemoryItem,
  type MemoryItemCreate,
  type Location,
  type LocationCreate,
  type LocationUpdate,
  type CharacterMemory,
  type CharacterMemoryCreate,
  type CharacterMemoryUpdate,
  type ChatEntityState,
  type CanonTimeline,
  type CanonEntryCreate,
} from '@simplechat/types'
import { dataDir } from './config.js'

// ─── Helpers ────────────────────────────────────────────────────────────────

async function storyDir(storyId: string): Promise<string> {
  const dir = join(await dataDir(), 'stories', storyId)
  await mkdir(dir, { recursive: true })
  return dir
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as T
  } catch {
    return fallback
  }
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(resolve(path, '..'), { recursive: true })
  await writeFile(path, JSON.stringify(data, null, 2))
}

function now(): string {
  return new Date().toISOString()
}

// ─── Stories ────────────────────────────────────────────────────────────────

export async function listStories(): Promise<Story[]> {
  const dir = join(await dataDir(), 'stories')
  if (!existsSync(dir)) return []
  const entries = await readdir(dir, { withFileTypes: true })
  const stories: Story[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const path = join(dir, entry.name, 'story.json')
    const raw = await readJson<unknown>(path, null)
    if (raw) {
      const result = StorySchema.safeParse(raw)
      if (result.success) stories.push(result.data)
    }
  }
  return stories.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getStory(id: string): Promise<Story | null> {
  const dir = await storyDir(id)
  const raw = await readJson<unknown>(join(dir, 'story.json'), null)
  if (!raw) return null
  const result = StorySchema.safeParse(raw)
  return result.success ? result.data : null
}

export async function createStory(data: StoryCreate): Promise<Story> {
  const story: Story = StorySchema.parse({
    id: randomUUID(),
    title: data.title,
    premise: data.premise ?? '',
    genres: data.genres ?? [],
    tone: data.tone ?? [],
    rules: data.rules ?? [],
    writingStyle: data.writingStyle ?? '',
    pov: data.pov ?? 'third-person-limited',
    createdAt: now(),
    updatedAt: now(),
  })
  const dir = await storyDir(story.id)
  await writeJson(join(dir, 'story.json'), story)
  await writeJson(join(dir, 'characters.json'), [])
  await writeJson(join(dir, 'locations.json'), [])
  await mkdir(join(dir, 'chats'), { recursive: true })
  await mkdir(join(dir, 'memory'), { recursive: true })
  await mkdir(join(dir, 'summaries'), { recursive: true })
  await mkdir(join(dir, 'character-memories'), { recursive: true })
  await mkdir(join(dir, 'state'), { recursive: true })
  await writeJson(join(dir, 'canon-timeline.json'), { storyId: story.id, entries: [] })
  return story
}

export async function updateStory(id: string, data: StoryUpdate): Promise<Story | null> {
  const story = await getStory(id)
  if (!story) return null
  const updated: Story = StorySchema.parse({ ...story, ...data, id, updatedAt: now() })
  const dir = await storyDir(id)
  await writeJson(join(dir, 'story.json'), updated)
  return updated
}

export async function deleteStory(id: string): Promise<boolean> {
  const dir = join(await dataDir(), 'stories', id)
  if (!existsSync(dir)) return false
  await rm(dir, { recursive: true, force: true })
  return true
}

// ─── Characters ─────────────────────────────────────────────────────────────

async function charFile(storyId: string): Promise<string> {
  const dir = await storyDir(storyId)
  return join(dir, 'characters.json')
}

export async function listCharacters(storyId: string): Promise<Character[]> {
  const path = await charFile(storyId)
  const raw = await readJson<unknown[]>(path, [])
  return raw.map((r) => CharacterSchema.safeParse(r)).filter((r) => r.success).map((r) => r.data!)
}

export async function getCharacter(storyId: string, charId: string): Promise<Character | null> {
  const chars = await listCharacters(storyId)
  return chars.find((c) => c.id === charId) ?? null
}

export async function createCharacter(storyId: string, data: CharacterCreate): Promise<Character> {
  const chars = await listCharacters(storyId)
  const char: Character = CharacterSchema.parse({
    id: randomUUID(),
    storyId,
    name: data.name,
    role: data.role ?? '',
    isUserPersona: data.isUserPersona ?? false,
    isNarrator: data.isNarrator ?? false,
    groupIds: data.groupIds ?? [],
    public: data.public ?? {},
    private: data.private ?? {},
    relationships: data.relationships ?? [],
    createdAt: now(),
    updatedAt: now(),
  })
  chars.push(char)
  await writeJson(await charFile(storyId), chars)
  return char
}

export async function updateCharacter(
  storyId: string,
  charId: string,
  data: CharacterUpdate,
): Promise<Character | null> {
  const chars = await listCharacters(storyId)
  const idx = chars.findIndex((c) => c.id === charId)
  if (idx === -1) return null
  const updated = CharacterSchema.parse({ ...chars[idx], ...data, id: charId, storyId, updatedAt: now() })
  chars[idx] = updated
  await writeJson(await charFile(storyId), chars)
  return updated
}

export async function deleteCharacter(storyId: string, charId: string): Promise<boolean> {
  const chars = await listCharacters(storyId)
  const next = chars.filter((c) => c.id !== charId)
  if (next.length === chars.length) return false
  await writeJson(await charFile(storyId), next)
  return true
}

// ─── Chats ──────────────────────────────────────────────────────────────────

async function chatMetaPath(storyId: string, chatId: string): Promise<string> {
  const dir = await storyDir(storyId)
  return join(dir, 'chats', `${chatId}.meta.json`)
}

async function chatLogPath(storyId: string, chatId: string): Promise<string> {
  const dir = await storyDir(storyId)
  return join(dir, 'chats', `${chatId}.jsonl`)
}

export async function listChats(storyId: string): Promise<Chat[]> {
  const dir = join(await storyDir(storyId), 'chats')
  if (!existsSync(dir)) return []
  const entries = await readdir(dir)
  const chats: Chat[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.meta.json')) continue
    const raw = await readJson<unknown>(join(dir, entry), null)
    if (raw) {
      const result = ChatSchema.safeParse(raw)
      if (result.success) chats.push(result.data)
    }
  }
  return chats.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getChat(storyId: string, chatId: string): Promise<Chat | null> {
  const path = await chatMetaPath(storyId, chatId)
  const raw = await readJson<unknown>(path, null)
  if (!raw) return null
  const result = ChatSchema.safeParse(raw)
  return result.success ? result.data : null
}

export async function createChat(data: ChatCreate): Promise<Chat> {
  const chat: Chat = ChatSchema.parse({
    id: randomUUID(),
    storyId: data.storyId,
    title: data.title ?? '',
    mode: data.mode ?? 'interactive',
    activeSpeakers: data.activeSpeakers ?? [],
    memoryAnchors: data.memoryAnchors ?? {},
    createdAt: now(),
    updatedAt: now(),
  })
  const path = await chatMetaPath(data.storyId, chat.id)
  await mkdir(resolve(path, '..'), { recursive: true })
  await writeJson(path, chat)
  return chat
}

export async function updateChat(storyId: string, chatId: string, data: Partial<Chat>): Promise<Chat | null> {
  const chat = await getChat(storyId, chatId)
  if (!chat) return null
  const updated = ChatSchema.parse({ ...chat, ...data, id: chatId, storyId, updatedAt: now() })
  await writeJson(await chatMetaPath(storyId, chatId), updated)
  return updated
}

export async function getTurns(storyId: string, chatId: string): Promise<Turn[]> {
  const path = await chatLogPath(storyId, chatId)
  try {
    const raw = await readFile(path, 'utf-8')
    const lines = raw.split('\n').filter(Boolean)
    return lines
      .map((l) => TurnSchema.safeParse(JSON.parse(l)))
      .filter((r) => r.success)
      .map((r) => r.data!)
  } catch {
    return []
  }
}

export async function appendTurn(storyId: string, turn: Turn): Promise<void> {
  const path = await chatLogPath(storyId, turn.chatId)
  await mkdir(resolve(path, '..'), { recursive: true })
  await appendFile(path, JSON.stringify(turn) + '\n')
  await updateChat(storyId, turn.chatId, {})
}

export async function updateTurn(storyId: string, chatId: string, turnId: string, text: string): Promise<Turn | null> {
  const turns = await getTurns(storyId, chatId)
  const idx = turns.findIndex((t) => t.id === turnId)
  if (idx === -1) return null
  turns[idx] = { ...turns[idx], text }
  const path = await chatLogPath(storyId, chatId)
  await writeFile(path, turns.map((t) => JSON.stringify(t)).join('\n') + '\n')
  return turns[idx]
}

export async function deleteFromTurn(storyId: string, chatId: string, turnId: string): Promise<boolean> {
  const turns = await getTurns(storyId, chatId)
  const idx = turns.findIndex((t) => t.id === turnId)
  if (idx === -1) return false
  const remaining = turns.slice(0, idx)
  const path = await chatLogPath(storyId, chatId)
  await writeFile(path, remaining.map((t) => JSON.stringify(t)).join('\n') + (remaining.length ? '\n' : ''))
  return true
}

export async function deleteAfterTurn(storyId: string, chatId: string, turnId: string): Promise<boolean> {
  const turns = await getTurns(storyId, chatId)
  const idx = turns.findIndex((t) => t.id === turnId)
  if (idx === -1) return false
  const remaining = turns.slice(0, idx + 1)
  const path = await chatLogPath(storyId, chatId)
  await writeFile(path, remaining.map((t) => JSON.stringify(t)).join('\n') + '\n')
  return true
}

export async function deleteSingleTurn(storyId: string, chatId: string, turnId: string): Promise<boolean> {
  const turns = await getTurns(storyId, chatId)
  const filtered = turns.filter((t) => t.id !== turnId)
  if (filtered.length === turns.length) return false
  const path = await chatLogPath(storyId, chatId)
  await writeFile(path, filtered.map((t) => JSON.stringify(t)).join('\n') + (filtered.length ? '\n' : ''))
  return true
}

// ─── Memory ─────────────────────────────────────────────────────────────────

async function memoryPath(storyId: string, chatId: string): Promise<string> {
  const dir = await storyDir(storyId)
  return join(dir, 'memory', `${chatId}-items.json`)
}

export async function listMemoryItems(storyId: string, chatId: string): Promise<MemoryItem[]> {
  const path = await memoryPath(storyId, chatId)
  const raw = await readJson<unknown[]>(path, [])
  return raw.map((r) => MemoryItemSchema.safeParse(r)).filter((r) => r.success).map((r) => r.data!)
}

export async function addMemoryItem(storyId: string, chatId: string, data: MemoryItemCreate): Promise<MemoryItem> {
  const items = await listMemoryItems(storyId, chatId)
  const item: MemoryItem = MemoryItemSchema.parse({
    id: randomUUID(),
    storyId,
    chatId,
    sourceTurnId: data.sourceTurnId,
    content: data.content,
    visibility: data.visibility ?? 'public',
    tags: data.tags ?? [],
    importance: data.importance ?? 0.5,
    revealed: false,
    timestamp: now(),
  })
  items.push(item)
  await writeJson(await memoryPath(storyId, chatId), items)
  return item
}

// ─── Locations ───────────────────────────────────────────────────────────────

async function locationsPath(storyId: string): Promise<string> {
  const dir = await storyDir(storyId)
  return join(dir, 'locations.json')
}

export async function listLocations(storyId: string): Promise<Location[]> {
  const path = await locationsPath(storyId)
  const raw = await readJson<unknown[]>(path, [])
  return raw.map((r) => LocationSchema.safeParse(r)).filter((r) => r.success).map((r) => r.data!)
}

export async function getLocation(storyId: string, locationId: string): Promise<Location | null> {
  const locations = await listLocations(storyId)
  return locations.find((l) => l.id === locationId) ?? null
}

export async function createLocation(storyId: string, data: LocationCreate): Promise<Location> {
  const locations = await listLocations(storyId)
  const location: Location = LocationSchema.parse({
    id: randomUUID(),
    storyId,
    name: data.name,
    description: data.description ?? '',
    layout: data.layout ?? '',
    lighting: data.lighting ?? '',
    atmosphere: data.atmosphere ?? '',
    soundscape: data.soundscape ?? '',
    smells: data.smells ?? '',
    notes: data.notes ?? '',
    tags: data.tags ?? [],
    createdAt: now(),
    updatedAt: now(),
  })
  locations.push(location)
  await writeJson(await locationsPath(storyId), locations)
  return location
}

export async function updateLocation(storyId: string, locationId: string, data: LocationUpdate): Promise<Location | null> {
  const locations = await listLocations(storyId)
  const idx = locations.findIndex((l) => l.id === locationId)
  if (idx === -1) return null
  const updated = LocationSchema.parse({ ...locations[idx], ...data, id: locationId, storyId, updatedAt: now() })
  locations[idx] = updated
  await writeJson(await locationsPath(storyId), locations)
  return updated
}

export async function deleteLocation(storyId: string, locationId: string): Promise<boolean> {
  const locations = await listLocations(storyId)
  const next = locations.filter((l) => l.id !== locationId)
  if (next.length === locations.length) return false
  await writeJson(await locationsPath(storyId), next)
  return true
}

// ─── Character Memories ──────────────────────────────────────────────────────

async function characterMemoryPath(storyId: string, charId: string): Promise<string> {
  const dir = await storyDir(storyId)
  const memDir = join(dir, 'character-memories')
  await mkdir(memDir, { recursive: true })
  return join(memDir, `${charId}.json`)
}

export async function listCharacterMemories(storyId: string, charId: string): Promise<CharacterMemory[]> {
  const path = await characterMemoryPath(storyId, charId)
  const raw = await readJson<unknown[]>(path, [])
  return raw.map((r) => CharacterMemorySchema.safeParse(r)).filter((r) => r.success).map((r) => r.data!)
}

export async function addCharacterMemory(storyId: string, charId: string, data: CharacterMemoryCreate): Promise<CharacterMemory> {
  const memories = await listCharacterMemories(storyId, charId)

  let previousMemoryId = data.previousMemoryId
  if (!previousMemoryId && memories.length > 0) {
    const heads = getHeadsFromList(memories)
    const head = heads.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    if (head) previousMemoryId = head.id
  }

  const memory: CharacterMemory = CharacterMemorySchema.parse({
    id: randomUUID(),
    storyId,
    characterId: charId,
    summary: data.summary,
    tags: data.tags ?? [],
    importance: data.importance ?? 0.5,
    sourceChatId: data.sourceChatId,
    sourceTurnId: data.sourceTurnId,
    previousMemoryId,
    branchLabel: data.branchLabel,
    deltas: data.deltas,
    createdAt: now(),
  })
  memories.push(memory)
  await writeJson(await characterMemoryPath(storyId, charId), memories)
  return memory
}

function getHeadsFromList(memories: CharacterMemory[]): CharacterMemory[] {
  const referenced = new Set(memories.map((m) => m.previousMemoryId).filter(Boolean))
  return memories.filter((m) => !referenced.has(m.id))
}

export async function getMemoryHeads(storyId: string, charId: string): Promise<CharacterMemory[]> {
  const memories = await listCharacterMemories(storyId, charId)
  if (memories.length === 0) return []
  return getHeadsFromList(memories)
}

export async function getMemoryChain(storyId: string, charId: string, fromMemoryId: string): Promise<CharacterMemory[]> {
  const memories = await listCharacterMemories(storyId, charId)
  const byId = new Map(memories.map((m) => [m.id, m]))

  const chain: CharacterMemory[] = []
  let current = byId.get(fromMemoryId)
  while (current) {
    chain.unshift(current)
    current = current.previousMemoryId ? byId.get(current.previousMemoryId) : undefined
  }
  return chain
}

export async function updateCharacterMemory(
  storyId: string,
  charId: string,
  memoryId: string,
  data: CharacterMemoryUpdate,
): Promise<CharacterMemory | null> {
  const memories = await listCharacterMemories(storyId, charId)
  const idx = memories.findIndex((m) => m.id === memoryId)
  if (idx === -1) return null
  const updated = CharacterMemorySchema.parse({ ...memories[idx], ...data, id: memoryId, storyId, characterId: charId })
  memories[idx] = updated
  await writeJson(await characterMemoryPath(storyId, charId), memories)
  return updated
}

export async function deleteCharacterMemory(storyId: string, charId: string, memoryId: string): Promise<boolean> {
  const memories = await listCharacterMemories(storyId, charId)
  const next = memories.filter((m) => m.id !== memoryId)
  if (next.length === memories.length) return false
  await writeJson(await characterMemoryPath(storyId, charId), next)
  return true
}

// ─── Chat Entity State ────────────────────────────────────────────────────────

async function chatStatePath(storyId: string, chatId: string): Promise<string> {
  const dir = await storyDir(storyId)
  const stateDir = join(dir, 'state')
  await mkdir(stateDir, { recursive: true })
  return join(stateDir, `${chatId}.json`)
}

export async function getChatState(storyId: string, chatId: string): Promise<ChatEntityState> {
  const path = await chatStatePath(storyId, chatId)
  const raw = await readJson<unknown>(path, null)
  if (raw) {
    const result = ChatEntityStateSchema.safeParse(raw)
    if (result.success) return result.data
  }
  return ChatEntityStateSchema.parse({ chatId, storyId, currentLocationId: null, locationOverrides: {}, updatedAt: now() })
}

export async function updateChatState(storyId: string, chatId: string, patch: Partial<ChatEntityState>): Promise<ChatEntityState> {
  const current = await getChatState(storyId, chatId)
  const updated = ChatEntityStateSchema.parse({ ...current, ...patch, chatId, storyId, updatedAt: now() })
  await writeJson(await chatStatePath(storyId, chatId), updated)
  return updated
}

// ─── Canon Timeline ───────────────────────────────────────────────────────────

async function canonTimelinePath(storyId: string): Promise<string> {
  const dir = await storyDir(storyId)
  return join(dir, 'canon-timeline.json')
}

export async function getCanonTimeline(storyId: string): Promise<CanonTimeline> {
  const path = await canonTimelinePath(storyId)
  const raw = await readJson<unknown>(path, null)
  if (raw) {
    const result = CanonTimelineSchema.safeParse(raw)
    if (result.success) return result.data
  }
  return CanonTimelineSchema.parse({ storyId, entries: [] })
}

export async function saveCanonTimeline(storyId: string, timeline: CanonTimeline): Promise<void> {
  await writeJson(await canonTimelinePath(storyId), timeline)
}

export async function addCanonEntry(storyId: string, data: CanonEntryCreate): Promise<CanonTimeline> {
  const timeline = await getCanonTimeline(storyId)
  const entry = CanonEntrySchema.parse({ id: randomUUID(), ...data })
  timeline.entries.push(entry)
  await saveCanonTimeline(storyId, timeline)
  return timeline
}

export async function removeCanonEntry(storyId: string, entryId: string): Promise<CanonTimeline> {
  const timeline = await getCanonTimeline(storyId)
  timeline.entries = timeline.entries.filter((e) => e.id !== entryId)
  await saveCanonTimeline(storyId, timeline)
  return timeline
}

export async function reorderCanonTimeline(storyId: string, orderedEntryIds: string[]): Promise<CanonTimeline> {
  const timeline = await getCanonTimeline(storyId)
  const byId = new Map(timeline.entries.map((e) => [e.id, e]))
  const reordered = orderedEntryIds.map((id) => byId.get(id)).filter((e): e is NonNullable<typeof e> => e !== undefined)
  const missing = timeline.entries.filter((e) => !orderedEntryIds.includes(e.id))
  timeline.entries = [...reordered, ...missing]
  await saveCanonTimeline(storyId, timeline)
  return timeline
}
