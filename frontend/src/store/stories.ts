import { create } from 'zustand'
import type { Story, StoryCreate, StoryUpdate, Character, CharacterCreate, CharacterUpdate, Location, LocationCreate, LocationUpdate } from '@simplechat/types'
import { api } from '../lib/api.js'

interface StoriesState {
  stories: Story[]
  selectedStoryId: string | null
  characters: Character[]
  locations: Location[]
  loading: boolean
  error: string | null

  loadStories: () => Promise<void>
  selectStory: (id: string) => Promise<void>
  createStory: (data: StoryCreate) => Promise<Story>
  updateStory: (id: string, data: StoryUpdate) => Promise<Story>
  deleteStory: (id: string) => Promise<void>
  reloadCharacters: () => Promise<void>
  createCharacter: (data: CharacterCreate) => Promise<Character>
  updateCharacter: (charId: string, data: CharacterUpdate) => Promise<Character>
  deleteCharacter: (charId: string) => Promise<void>
  reloadLocations: () => Promise<void>
  createLocation: (data: LocationCreate) => Promise<Location>
  updateLocation: (locationId: string, data: LocationUpdate) => Promise<Location>
  deleteLocation: (locationId: string) => Promise<void>
}

export const useStoriesStore = create<StoriesState>((set, get) => ({
  stories: [],
  selectedStoryId: null,
  characters: [],
  locations: [],
  loading: false,
  error: null,

  loadStories: async () => {
    set({ loading: true, error: null })
    try {
      const stories = await api.stories.list()
      set({ stories, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  selectStory: async (id: string) => {
    set({ selectedStoryId: id, characters: [], locations: [] })
    try {
      const { characters, locations } = await api.stories.get(id)
      set({ characters, locations })
    } catch {
      // story may have no characters yet
    }
  },

  createStory: async (data: StoryCreate) => {
    const story = await api.stories.create(data)
    set((s) => ({ stories: [story, ...s.stories] }))
    return story
  },

  updateStory: async (id: string, data: StoryUpdate) => {
    const story = await api.stories.update(id, data)
    set((s) => ({ stories: s.stories.map((s2) => (s2.id === id ? story : s2)) }))
    return story
  },

  deleteStory: async (id: string) => {
    await api.stories.delete(id)
    set((s) => ({
      stories: s.stories.filter((s2) => s2.id !== id),
      selectedStoryId: s.selectedStoryId === id ? null : s.selectedStoryId,
    }))
  },

  reloadCharacters: async () => {
    const { selectedStoryId } = get()
    if (!selectedStoryId) return
    const chars = await api.characters.list(selectedStoryId)
    set({ characters: chars })
  },

  createCharacter: async (data: CharacterCreate) => {
    const { selectedStoryId } = get()
    if (!selectedStoryId) throw new Error('No story selected')
    const char = await api.characters.create(selectedStoryId, data)
    set((s) => ({ characters: [...s.characters, char] }))
    return char
  },

  updateCharacter: async (charId: string, data: CharacterUpdate) => {
    const { selectedStoryId } = get()
    if (!selectedStoryId) throw new Error('No story selected')
    const char = await api.characters.update(selectedStoryId, charId, data)
    set((s) => ({ characters: s.characters.map((c) => (c.id === charId ? char : c)) }))
    return char
  },

  deleteCharacter: async (charId: string) => {
    const { selectedStoryId } = get()
    if (!selectedStoryId) throw new Error('No story selected')
    await api.characters.delete(selectedStoryId, charId)
    set((s) => ({ characters: s.characters.filter((c) => c.id !== charId) }))
  },

  reloadLocations: async () => {
    const { selectedStoryId } = get()
    if (!selectedStoryId) return
    const locations = await api.locations.list(selectedStoryId)
    set({ locations })
  },

  createLocation: async (data: LocationCreate) => {
    const { selectedStoryId } = get()
    if (!selectedStoryId) throw new Error('No story selected')
    const location = await api.locations.create(selectedStoryId, data)
    set((s) => ({ locations: [...s.locations, location] }))
    return location
  },

  updateLocation: async (locationId: string, data: LocationUpdate) => {
    const { selectedStoryId } = get()
    if (!selectedStoryId) throw new Error('No story selected')
    const location = await api.locations.update(selectedStoryId, locationId, data)
    set((s) => ({ locations: s.locations.map((l) => (l.id === locationId ? location : l)) }))
    return location
  },

  deleteLocation: async (locationId: string) => {
    const { selectedStoryId } = get()
    if (!selectedStoryId) throw new Error('No story selected')
    await api.locations.delete(selectedStoryId, locationId)
    set((s) => ({ locations: s.locations.filter((l) => l.id !== locationId) }))
  },
}))
