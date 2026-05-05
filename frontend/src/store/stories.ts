import type {
	CanonTimeline,
	Character,
	CharacterCreate,
	CharacterMemoryRelation,
	CharacterUpdate,
	EntityFieldDef,
	StoryLocation as Location,
	LocationCreate,
	LocationUpdate,
	MemoryItem,
	Story,
	StoryCreate,
	StoryUpdate,
} from '@simplechat/types';
import { create } from 'zustand';
import { api } from '../lib/api.js';

interface StoriesState {
	stories: Story[];
	selectedStoryId: string | null;
	characters: Character[];
	locations: Location[];
	canonTimeline: CanonTimeline | null;
	characterMemories: Record<
		string,
		Array<{ relation: CharacterMemoryRelation; memory: MemoryItem }>
	>;
	fieldDefs: EntityFieldDef[];
	loading: boolean;
	error: string | null;

	loadStories: () => Promise<void>;
	selectStory: (id: string | null) => Promise<void>;
	createStory: (data: StoryCreate) => Promise<Story>;
	updateStory: (id: string, data: StoryUpdate) => Promise<Story>;
	deleteStory: (id: string) => Promise<void>;
	reloadCharacters: () => Promise<void>;
	createCharacter: (data: CharacterCreate) => Promise<Character>;
	updateCharacter: (
		charId: string,
		data: CharacterUpdate,
	) => Promise<Character>;
	deleteCharacter: (charId: string) => Promise<void>;
	loadCharacterTimeline: (charId: string) => Promise<void>;
	loadFieldDefs: (storyId: string) => Promise<void>;
	initCharacterGenesis: (charId: string) => Promise<void>;
	reloadLocations: () => Promise<void>;
	createLocation: (data: LocationCreate) => Promise<Location>;
	updateLocation: (
		locationId: string,
		data: LocationUpdate,
	) => Promise<Location>;
	deleteLocation: (locationId: string) => Promise<void>;
	loadCanonTimeline: (storyId: string) => Promise<void>;
	addCanonEntry: (
		storyId: string,
		entry: { characterId: string; memoryId: string; label?: string },
	) => Promise<void>;
	reorderCanonTimeline: (
		storyId: string,
		entryIds: string[],
	) => Promise<void>;
	removeCanonEntry: (storyId: string, entryId: string) => Promise<void>;
}

export const useStoriesStore = create<StoriesState>((set, get) => ({
	addCanonEntry: async (storyId: string, entry) => {
		const timeline = await api.canonTimeline.addEntry(storyId, entry);
		set({ canonTimeline: timeline });
	},
	canonTimeline: null,
	characterMemories: {},
	characters: [],

	createCharacter: async (data: CharacterCreate) => {
		const { selectedStoryId } = get();
		if (!selectedStoryId) throw new Error('No story selected');
		const char = await api.characters.create(selectedStoryId, data);
		set((s) => ({ characters: [...s.characters, char] }));
		return char;
	},

	createLocation: async (data: LocationCreate) => {
		const { selectedStoryId } = get();
		if (!selectedStoryId) throw new Error('No story selected');
		const location = await api.locations.create(selectedStoryId, data);
		set((s) => ({ locations: [...s.locations, location] }));
		return location;
	},

	createStory: async (data: StoryCreate) => {
		const story = await api.stories.create(data);
		set((s) => ({ stories: [story, ...s.stories] }));
		return story;
	},

	deleteCharacter: async (charId: string) => {
		const { selectedStoryId } = get();
		if (!selectedStoryId) throw new Error('No story selected');
		await api.characters.delete(selectedStoryId, charId);
		set((s) => {
			const { [charId]: _, ...rest } = s.characterMemories;
			return {
				characterMemories: rest,
				characters: s.characters.filter((c) => c.id !== charId),
			};
		});
	},

	deleteLocation: async (locationId: string) => {
		const { selectedStoryId } = get();
		if (!selectedStoryId) throw new Error('No story selected');
		await api.locations.delete(selectedStoryId, locationId);
		set((s) => ({
			locations: s.locations.filter((l) => l.id !== locationId),
		}));
	},

	deleteStory: async (id: string) => {
		await api.stories.delete(id);
		set((s) => ({
			canonTimeline: s.selectedStoryId === id ? null : s.canonTimeline,
			selectedStoryId:
				s.selectedStoryId === id ? null : s.selectedStoryId,
			stories: s.stories.filter((s2) => s2.id !== id),
		}));
	},
	error: null,
	fieldDefs: [],

	initCharacterGenesis: async (charId: string) => {
		const { selectedStoryId } = get();
		if (!selectedStoryId) return;
		const updated = await api.characters.initGenesis(
			selectedStoryId,
			charId,
		);
		set((s) => ({
			characters: s.characters.map((c) =>
				c.id === charId ? updated : c,
			),
		}));
		const pairs = await api.characterMemories.chain(
			selectedStoryId,
			charId,
		);
		set((s) => ({
			characterMemories: { ...s.characterMemories, [charId]: pairs },
		}));
	},

	loadCanonTimeline: async (storyId: string) => {
		try {
			const canonTimeline = await api.canonTimeline.get(storyId);
			set({ canonTimeline });
		} catch {
			set({ canonTimeline: null });
		}
	},

	loadCharacterTimeline: async (charId: string) => {
		const { selectedStoryId } = get();
		if (!selectedStoryId) return;
		const pairs = await api.characterMemories.chain(
			selectedStoryId,
			charId,
		);
		set((s) => ({
			characterMemories: { ...s.characterMemories, [charId]: pairs },
		}));
	},

	loadFieldDefs: async (storyId: string) => {
		const defs = await api.fieldDefs.list(storyId);
		set({ fieldDefs: defs });
	},
	loading: false,

	loadStories: async () => {
		set({ error: null, loading: true });
		try {
			const stories = await api.stories.list();
			set({ loading: false, stories });
		} catch (err) {
			set({ error: (err as Error).message, loading: false });
		}
	},
	locations: [],

	reloadCharacters: async () => {
		const { selectedStoryId } = get();
		if (!selectedStoryId) return;
		const chars = await api.characters.list(selectedStoryId);
		set({ characters: chars });
	},

	reloadLocations: async () => {
		const { selectedStoryId } = get();
		if (!selectedStoryId) return;
		const locations = await api.locations.list(selectedStoryId);
		set({ locations });
	},

	removeCanonEntry: async (storyId: string, entryId: string) => {
		const timeline = await api.canonTimeline.removeEntry(storyId, entryId);
		set({ canonTimeline: timeline });
	},

	reorderCanonTimeline: async (storyId: string, entryIds: string[]) => {
		const timeline = await api.canonTimeline.reorder(storyId, entryIds);
		set({ canonTimeline: timeline });
	},
	selectedStoryId: null,

	selectStory: async (id: string | null) => {
		if (id === null) {
			set({
				canonTimeline: null,
				characters: [],
				fieldDefs: [],
				locations: [],
				selectedStoryId: null,
			});
			return;
		}
		set({
			canonTimeline: null,
			characters: [],
			fieldDefs: [],
			locations: [],
			selectedStoryId: id,
		});
		try {
			const { characters, locations } = await api.stories.get(id);
			set({ characters, locations });
		} catch {
			// story may have no characters yet
		}
		try {
			const canonTimeline = await api.canonTimeline.get(id);
			set({ canonTimeline });
		} catch {
			// timeline may not exist yet for older stories
		}
		try {
			const fieldDefs = await api.fieldDefs.list(id);
			set({ fieldDefs });
		} catch {
			// field defs not yet seeded for this story
		}
	},
	stories: [],

	updateCharacter: async (charId: string, data: CharacterUpdate) => {
		const { selectedStoryId } = get();
		if (!selectedStoryId) throw new Error('No story selected');
		const char = await api.characters.update(selectedStoryId, charId, data);
		set((s) => ({
			characters: s.characters.map((c) => (c.id === charId ? char : c)),
		}));
		return char;
	},

	updateLocation: async (locationId: string, data: LocationUpdate) => {
		const { selectedStoryId } = get();
		if (!selectedStoryId) throw new Error('No story selected');
		const location = await api.locations.update(
			selectedStoryId,
			locationId,
			data,
		);
		set((s) => ({
			locations: s.locations.map((l) =>
				l.id === locationId ? location : l,
			),
		}));
		return location;
	},

	updateStory: async (id: string, data: StoryUpdate) => {
		const story = await api.stories.update(id, data);
		set((s) => ({
			stories: s.stories.map((s2) => (s2.id === id ? story : s2)),
		}));
		return story;
	},
}));
