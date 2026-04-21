import type {
  Story,
  StoryCreate,
  StoryUpdate,
  Character,
  CharacterCreate,
  CharacterUpdate,
  Location,
  LocationCreate,
  LocationUpdate,
  CharacterMemory,
  CharacterMemoryCreate,
  CharacterMemoryUpdate,
  ChatEntityState,
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
    get: (id: string) => request<{ story: Story; characters: Character[]; locations: Location[] }>(`/stories/${id}`),
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
    parseText: (text: string) =>
      request<{
        title: string; premise: string; genres: string[]; tone: string[]; rules: string[]; writingStyle: string
        characters: Array<{
          name: string; role: string; isUserPersona: boolean; age: string; gender: string
          species: string; clothing: string; appearance: string; personality: string[]
          speechStyle: string; trueMotives: string; fears: string[]
        }>
        locations: Array<{
          name: string; description: string; layout: string; lighting: string
          atmosphere: string; soundscape: string; smells: string; notes: string; tags: string[]
        }>
      }>(
        '/stories/parse-text',
        { method: 'POST', body: JSON.stringify({ text }) },
      ),

    generateStoryCore: (concept: string, includeTitle?: boolean) =>
      request<{ title?: string; genres: string[]; tone: string[]; rules: string[]; writingStyle: string }>(
        '/stories/generate-story-core',
        { method: 'POST', body: JSON.stringify({ concept, includeTitle }) },
      ),
    generateStoryCharacters: (concept: string, core: { genres: string[]; tone: string[]; writingStyle: string }) =>
      request<{ characters: Array<{
        name: string; role: string; isUserPersona: boolean; age: string; gender: string
        species: string; clothing: string; appearance: string; personality: string[]
        speechStyle: string; trueMotives: string; fears: string[]
      }> }>(
        '/stories/generate-story-characters',
        { method: 'POST', body: JSON.stringify({ concept, ...core }) },
      ),
    parseStoryCore: (text: string) =>
      request<{ title: string; premise: string; genres: string[]; tone: string[]; rules: string[]; writingStyle: string }>(
        '/stories/parse-story-core',
        { method: 'POST', body: JSON.stringify({ text }) },
      ),
    parseStoryCharacters: (text: string, premise: string) =>
      request<{ characters: Array<{
        name: string; role: string; isUserPersona: boolean; age: string; gender: string
        species: string; clothing: string; appearance: string; personality: string[]
        speechStyle: string; trueMotives: string; fears: string[]
      }> }>(
        '/stories/parse-story-characters',
        { method: 'POST', body: JSON.stringify({ text, premise }) },
      ),
    parseStoryLocations: (text: string, premise: string) =>
      request<{ locations: Array<{
        name: string; description: string; layout: string; lighting: string
        atmosphere: string; soundscape: string; smells: string; notes: string; tags: string[]
      }> }>(
        '/stories/parse-story-locations',
        { method: 'POST', body: JSON.stringify({ text, premise }) },
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

  locations: {
    list: (storyId: string) => request<Location[]>(`/stories/${storyId}/locations`),
    create: (storyId: string, data: LocationCreate) =>
      request<Location>(`/stories/${storyId}/locations`, { method: 'POST', body: JSON.stringify(data) }),
    update: (storyId: string, locationId: string, data: LocationUpdate) =>
      request<Location>(`/stories/${storyId}/locations/${locationId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (storyId: string, locationId: string) =>
      request<{ ok: boolean }>(`/stories/${storyId}/locations/${locationId}`, { method: 'DELETE' }),
    generateFields: (storyId: string, prompt: string) =>
      request<{
        name: string; description: string; layout: string; lighting: string;
        atmosphere: string; soundscape: string; smells: string; notes: string; tags: string[];
      }>(`/stories/${storyId}/locations/generate-fields`, {
        method: 'POST',
        body: JSON.stringify({ prompt }),
      }),
  },

  characterMemories: {
    list: (storyId: string, charId: string) =>
      request<CharacterMemory[]>(`/stories/${storyId}/characters/${charId}/memories`),
    chain: (storyId: string, charId: string, from?: string) =>
      request<CharacterMemory[]>(
        `/stories/${storyId}/characters/${charId}/memories/chain${from ? `?from=${from}` : ''}`,
      ),
    create: (storyId: string, charId: string, data: CharacterMemoryCreate) =>
      request<CharacterMemory>(`/stories/${storyId}/characters/${charId}/memories`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (storyId: string, charId: string, memoryId: string, data: CharacterMemoryUpdate) =>
      request<CharacterMemory>(`/stories/${storyId}/characters/${charId}/memories/${memoryId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (storyId: string, charId: string, memoryId: string) =>
      request<{ ok: boolean }>(`/stories/${storyId}/characters/${charId}/memories/${memoryId}`, {
        method: 'DELETE',
      }),
  },

  chatState: {
    get: (storyId: string, chatId: string) =>
      request<ChatEntityState>(`/stories/${storyId}/chats/${chatId}/state`),
    update: (storyId: string, chatId: string, data: Partial<ChatEntityState>) =>
      request<ChatEntityState>(`/stories/${storyId}/chats/${chatId}/state`, {
        method: 'PATCH',
        body: JSON.stringify(data),
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
