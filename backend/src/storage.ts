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
  await mkdir(join(dir, 'chats'), { recursive: true })
  await mkdir(join(dir, 'memory'), { recursive: true })
  await mkdir(join(dir, 'summaries'), { recursive: true })
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
