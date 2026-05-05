import type {
	AppSettings,
	CanonTimeline,
	Character,
	CharacterCreate,
	CharacterMemoryCreate,
	CharacterMemoryRelation,
	CharacterMemoryUpdate,
	CharacterUpdate,
	Chat,
	ChatCreate,
	ChatEntityState,
	EntityFieldDef,
	EntityFieldDefCreate,
	EntityFieldDefUpdate,
	StoryLocation as Location,
	LocationCreate,
	LocationUpdate,
	MemoryItem,
	Story,
	StoryCreate,
	StoryUpdate,
	Turn,
} from '@simplechat/types';

const BASE = '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(BASE + path, {
		...init,
		headers: {
			...(init?.body !== undefined
				? { 'Content-Type': 'application/json' }
				: {}),
			...init?.headers,
		},
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`${res.status} ${body}`);
	}
	return res.json() as Promise<T>;
}

// ─── Stories ────────────────────────────────────────────────────────────────

export const api = {
	stories: {
		list: () => request<Story[]>('/stories'),
		get: (id: string) =>
			request<{
				story: Story;
				characters: Character[];
				locations: Location[];
			}>(`/stories/${id}`),
		create: (data: StoryCreate) =>
			request<Story>('/stories', {
				method: 'POST',
				body: JSON.stringify(data),
			}),
		update: (id: string, data: StoryUpdate) =>
			request<Story>(`/stories/${id}`, {
				method: 'PATCH',
				body: JSON.stringify(data),
			}),
		delete: (id: string) =>
			request<{ ok: boolean }>(`/stories/${id}`, { method: 'DELETE' }),
	},

	chats: {
		list: (storyId: string) => request<Chat[]>(`/stories/${storyId}/chats`),
		get: (storyId: string, chatId: string) =>
			request<Chat>(`/stories/${storyId}/chats/${chatId}`),
		create: (
			storyId: string,
			data: Omit<ChatCreate, 'storyId'> & { startingLocationId?: string },
		) =>
			request<Chat>(`/stories/${storyId}/chats`, {
				method: 'POST',
				body: JSON.stringify(data),
			}),
		history: (storyId: string, chatId: string) =>
			request<Turn[]>(`/stories/${storyId}/chats/${chatId}/history`),
		seed: (storyId: string, chatId: string, text: string) =>
			request<Turn>(`/stories/${storyId}/chats/${chatId}/seed`, {
				method: 'POST',
				body: JSON.stringify({ text }),
			}),
		editTurn: (
			storyId: string,
			chatId: string,
			turnId: string,
			text: string,
		) =>
			request<Turn>(
				`/stories/${storyId}/chats/${chatId}/turns/${turnId}`,
				{
					method: 'PATCH',
					body: JSON.stringify({ text }),
				},
			),
		deleteTurn: (storyId: string, chatId: string, turnId: string) =>
			request<{ ok: boolean }>(
				`/stories/${storyId}/chats/${chatId}/turns/${turnId}`,
				{
					method: 'DELETE',
				},
			),
		deleteAfterTurn: (storyId: string, chatId: string, turnId: string) =>
			request<{ ok: boolean }>(
				`/stories/${storyId}/chats/${chatId}/turns/${turnId}/after`,
				{
					method: 'DELETE',
				},
			),
		delete: (storyId: string, chatId: string) =>
			request<{ ok: boolean }>(`/stories/${storyId}/chats/${chatId}`, {
				method: 'DELETE',
			}),
		update: (
			storyId: string,
			chatId: string,
			data: { title?: string; mode?: string },
		) =>
			request<Chat>(`/stories/${storyId}/chats/${chatId}`, {
				method: 'PATCH',
				body: JSON.stringify(data),
			}),
	},

	characters: {
		list: (storyId: string) =>
			request<Character[]>(`/stories/${storyId}/characters`),
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
			request<{ ok: boolean }>(
				`/stories/${storyId}/characters/${charId}`,
				{
					method: 'DELETE',
				},
			),
		relationships: (storyId: string, charId: string) =>
			request<
				Array<{
					charId: string;
					otherCharName: string;
					emotion: string;
					publicAttitude: string;
					privateAttitude: string;
					trustLevel: number;
					sourceMemoryId?: string;
				}>
			>(`/stories/${storyId}/characters/${charId}/relationships`),
		initGenesis: (storyId: string, charId: string) =>
			request<Character>(
				`/stories/${storyId}/characters/${charId}/genesis`,
				{
					method: 'POST',
				},
			),
	},

	locations: {
		list: (storyId: string) =>
			request<Location[]>(`/stories/${storyId}/locations`),
		create: (storyId: string, data: LocationCreate) =>
			request<Location>(`/stories/${storyId}/locations`, {
				method: 'POST',
				body: JSON.stringify(data),
			}),
		update: (storyId: string, locationId: string, data: LocationUpdate) =>
			request<Location>(`/stories/${storyId}/locations/${locationId}`, {
				method: 'PATCH',
				body: JSON.stringify(data),
			}),
		delete: (storyId: string, locationId: string) =>
			request<{ ok: boolean }>(
				`/stories/${storyId}/locations/${locationId}`,
				{
					method: 'DELETE',
				},
			),
	},

	characterMemories: {
		list: (storyId: string, charId: string) =>
			request<MemoryItem[]>(
				`/stories/${storyId}/characters/${charId}/memories`,
			),
		chain: (storyId: string, charId: string, from?: string) =>
			request<
				Array<{ relation: CharacterMemoryRelation; memory: MemoryItem }>
			>(
				`/stories/${storyId}/characters/${charId}/memories/chain${from ? `?from=${from}` : ''}`,
			),
		create: (
			storyId: string,
			charId: string,
			data: CharacterMemoryCreate,
		) =>
			request<{ relation: CharacterMemoryRelation; memory: MemoryItem }>(
				`/stories/${storyId}/characters/${charId}/memories`,
				{ method: 'POST', body: JSON.stringify(data) },
			),
		update: (
			storyId: string,
			charId: string,
			memoryId: string,
			data: CharacterMemoryUpdate,
		) =>
			request<MemoryItem>(
				`/stories/${storyId}/characters/${charId}/memories/${memoryId}`,
				{
					method: 'PATCH',
					body: JSON.stringify(data),
				},
			),
		delete: (storyId: string, charId: string, memoryId: string) =>
			request<{ ok: boolean }>(
				`/stories/${storyId}/characters/${charId}/memories/${memoryId}`,
				{
					method: 'DELETE',
				},
			),
	},

	fieldDefs: {
		list: (storyId: string, entityType?: string) =>
			request<EntityFieldDef[]>(
				`/stories/${storyId}/field-defs${entityType ? `?entityType=${encodeURIComponent(entityType)}` : ''}`,
			),
		create: (storyId: string, data: EntityFieldDefCreate) =>
			request<EntityFieldDef>(`/stories/${storyId}/field-defs`, {
				method: 'POST',
				body: JSON.stringify(data),
			}),
		update: (storyId: string, defId: string, data: EntityFieldDefUpdate) =>
			request<EntityFieldDef>(`/stories/${storyId}/field-defs/${defId}`, {
				method: 'PATCH',
				body: JSON.stringify(data),
			}),
		delete: (storyId: string, defId: string) =>
			request<{ ok: boolean }>(
				`/stories/${storyId}/field-defs/${defId}`,
				{
					method: 'DELETE',
				},
			),
	},

	chatState: {
		get: (storyId: string, chatId: string) =>
			request<ChatEntityState>(
				`/stories/${storyId}/chats/${chatId}/state`,
			),
		update: (
			storyId: string,
			chatId: string,
			data: Partial<ChatEntityState>,
		) =>
			request<ChatEntityState>(
				`/stories/${storyId}/chats/${chatId}/state`,
				{
					method: 'PATCH',
					body: JSON.stringify(data),
				},
			),
	},

	settings: {
		get: () => request<AppSettings>('/settings'),
		update: (data: Partial<AppSettings>) =>
			request<AppSettings>('/settings', {
				method: 'PATCH',
				body: JSON.stringify(data),
			}),
	},

	canonTimeline: {
		get: (storyId: string) =>
			request<CanonTimeline>(`/stories/${storyId}/canon-timeline`),
		addEntry: (
			storyId: string,
			entry: { characterId: string; memoryId: string; label?: string },
		) =>
			request<CanonTimeline>(
				`/stories/${storyId}/canon-timeline/entries`,
				{
					method: 'POST',
					body: JSON.stringify(entry),
				},
			),
		reorder: (storyId: string, entryIds: string[]) =>
			request<CanonTimeline>(
				`/stories/${storyId}/canon-timeline/reorder`,
				{
					method: 'PUT',
					body: JSON.stringify({ entryIds }),
				},
			),
		removeEntry: (storyId: string, entryId: string) =>
			request<CanonTimeline>(
				`/stories/${storyId}/canon-timeline/entries/${entryId}`,
				{ method: 'DELETE' },
			),
	},

	ai: {
		generate: <T = Record<string, unknown>>(
			type: string,
			concept: string,
			context?: Record<string, unknown>,
			count?: number,
		) =>
			request<T>('/ai/generate', {
				method: 'POST',
				body: JSON.stringify({ type, concept, context, count }),
			}),
		parse: <T = Record<string, unknown>>(
			type: string,
			text: string,
			context?: Record<string, unknown>,
		) =>
			request<T>('/ai/parse', {
				method: 'POST',
				body: JSON.stringify({ type, text, context }),
			}),
	},

	ollama: {
		health: () => request<{ ok: boolean }>('/ollama/health'),
		models: () =>
			request<{ name: string; model: string }[]>('/ollama/models'),
	},
};
