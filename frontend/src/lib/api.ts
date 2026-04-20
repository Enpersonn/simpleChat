import type {
  Story,
  StoryCreate,
  StoryUpdate,
  Character,
  CharacterCreate,
  CharacterUpdate,
  Chat,
  ChatCreate,
  Turn,
  AppSettings,
} from '@simplechat/types'

const BASE = ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status} ${body}`)
  }
  return res.json() as Promise<T>
}

// ─── Stories ────────────────────────────────────────────────────────────────

export const api = {
  stories: {
    list: () => request<Story[]>('/stories'),
    get: (id: string) => request<{ story: Story; characters: Character[] }>(`/stories/${id}`),
    create: (data: StoryCreate) =>
      request<Story>('/stories', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: StoryUpdate) =>
      request<Story>(`/stories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => request<{ ok: boolean }>(`/stories/${id}`, { method: 'DELETE' }),
    autofill: (id: string, field: string, context: string) =>
      request<{ field: string; result: string }>(`/stories/${id}/autofill`, {
        method: 'POST',
        body: JSON.stringify({ field, context }),
      }),
    generateFields: (concept: string, includeTitle?: boolean) =>
      request<{
        title?: string; genres: string[]; tone: string[]; rules: string[]; writingStyle: string
        characters: Array<{
          name: string; role: string; isUserPersona: boolean; age: string; gender: string
          species: string; clothing: string; appearance: string; personality: string[]
          speechStyle: string; trueMotives: string; fears: string[]
        }>
      }>(
        '/stories/generate-fields',
        { method: 'POST', body: JSON.stringify({ concept, includeTitle }) },
      ),
    generateSupporting: (storyId: string) =>
      request<{ genres: string[]; tone: string[]; rules: string[]; writingStyle: string }>(
        `/stories/${storyId}/generate-supporting`,
        { method: 'POST', body: JSON.stringify({}) },
      ),
  },

  chats: {
    list: (storyId: string) => request<Chat[]>(`/stories/${storyId}/chats`),
    create: (storyId: string, data: Omit<ChatCreate, 'storyId'>) =>
      request<Chat>(`/stories/${storyId}/chats`, { method: 'POST', body: JSON.stringify(data) }),
    history: (storyId: string, chatId: string) =>
      request<Turn[]>(`/stories/${storyId}/chats/${chatId}/history`),
    seed: (storyId: string, chatId: string, text: string) =>
      request<Turn>(`/stories/${storyId}/chats/${chatId}/seed`, { method: 'POST', body: JSON.stringify({ text }) }),
    editTurn: (storyId: string, chatId: string, turnId: string, text: string) =>
      request<Turn>(`/stories/${storyId}/chats/${chatId}/turns/${turnId}`, {
        method: 'PATCH',
        body: JSON.stringify({ text }),
      }),
    deleteTurn: (storyId: string, chatId: string, turnId: string) =>
      request<{ ok: boolean }>(`/stories/${storyId}/chats/${chatId}/turns/${turnId}`, {
        method: 'DELETE',
      }),
    deleteAfterTurn: (storyId: string, chatId: string, turnId: string) =>
      request<{ ok: boolean }>(`/stories/${storyId}/chats/${chatId}/turns/${turnId}/after`, {
        method: 'DELETE',
      }),
  },

  characters: {
    list: (storyId: string) => request<Character[]>(`/stories/${storyId}/characters`),
    create: (storyId: string, data: CharacterCreate) =>
      request<Character>(`/stories/${storyId}/characters`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (storyId: string, charId: string, data: CharacterUpdate) =>
      request<Character>(`/stories/${storyId}/characters/${charId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (storyId: string, charId: string) =>
      request<{ ok: boolean }>(`/stories/${storyId}/characters/${charId}`, { method: 'DELETE' }),
    generateFields: (storyId: string, prompt: string) =>
      request<{
        name: string; role: string; age: string; gender: string; species: string;
        clothing: string; appearance: string; personality: string[];
        speechStyle: string; trueMotives: string; fears: string[];
      }>(`/stories/${storyId}/characters/generate-fields`, {
        method: 'POST',
        body: JSON.stringify({ prompt }),
      }),
  },

  settings: {
    get: () => request<AppSettings>('/settings'),
    update: (data: Partial<AppSettings>) =>
      request<AppSettings>('/settings', { method: 'PATCH', body: JSON.stringify(data) }),
  },

  ollama: {
    health: () => request<{ ok: boolean }>('/ollama/health'),
    models: () => request<{ name: string; model: string }[]>('/ollama/models'),
  },
}
