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
	ImportJobSnapshot,
	ImportJobSummary,
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
	ai: {
		generate: <T = Record<string, unknown>>(
			type: string,
			concept: string,
			context?: Record<string, unknown>,
			count?: number,
		) =>
			request<T>('/ai/generate', {
				body: JSON.stringify({ concept, context, count, type }),
				method: 'POST',
			}),
		parse: <T = Record<string, unknown>>(
			type: string,
			text: string,
			context?: Record<string, unknown>,
		) =>
			request<T>('/ai/parse', {
				body: JSON.stringify({ context, text, type }),
				method: 'POST',
			}),
	},

	importJobs: {
		cancel: (jobId: string) =>
			request<ImportJobSnapshot>(`/ai/import-jobs/${jobId}/cancel`, {
				method: 'POST',
			}),
		clearAll: () =>
			request<{ ok: boolean }>('/ai/import-jobs', {
				method: 'DELETE',
			}),
		create: (text: string, context?: Record<string, unknown>) =>
			request<{ jobId: string }>('/ai/import-jobs', {
				body: JSON.stringify({ context, text }),
				method: 'POST',
			}),
		delete: (jobId: string) =>
			request<{ ok: boolean }>(`/ai/import-jobs/${jobId}`, {
				method: 'DELETE',
			}),
		get: (jobId: string) =>
			request<ImportJobSnapshot>(`/ai/import-jobs/${jobId}`),
		recent: () =>
			request<ImportJobSummary[]>('/ai/import-jobs/recent'),
	},

	canonTimeline: {
		addEntry: (
			storyId: string,
			entry: { characterId: string; memoryId: string; label?: string },
		) =>
			request<CanonTimeline>(
				`/stories/${storyId}/canon-timeline/entries`,
				{
					body: JSON.stringify(entry),
					method: 'POST',
				},
			),
		get: (storyId: string) =>
			request<CanonTimeline>(`/stories/${storyId}/canon-timeline`),
		removeEntry: (storyId: string, entryId: string) =>
			request<CanonTimeline>(
				`/stories/${storyId}/canon-timeline/entries/${entryId}`,
				{ method: 'DELETE' },
			),
		reorder: (storyId: string, entryIds: string[]) =>
			request<CanonTimeline>(
				`/stories/${storyId}/canon-timeline/reorder`,
				{
					body: JSON.stringify({ entryIds }),
					method: 'PUT',
				},
			),
	},

	characterMemories: {
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
				{ body: JSON.stringify(data), method: 'POST' },
			),
		delete: (storyId: string, charId: string, memoryId: string) =>
			request<{ ok: boolean }>(
				`/stories/${storyId}/characters/${charId}/memories/${memoryId}`,
				{
					method: 'DELETE',
				},
			),
		list: (storyId: string, charId: string) =>
			request<MemoryItem[]>(
				`/stories/${storyId}/characters/${charId}/memories`,
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
					body: JSON.stringify(data),
					method: 'PATCH',
				},
			),
	},

	characters: {
		create: (storyId: string, data: CharacterCreate) =>
			request<Character>(`/stories/${storyId}/characters`, {
				body: JSON.stringify(data),
				method: 'POST',
			}),
		delete: (storyId: string, charId: string) =>
			request<{ ok: boolean }>(
				`/stories/${storyId}/characters/${charId}`,
				{
					method: 'DELETE',
				},
			),
		initGenesis: (storyId: string, charId: string) =>
			request<Character>(
				`/stories/${storyId}/characters/${charId}/genesis`,
				{
					method: 'POST',
				},
			),
		list: (storyId: string) =>
			request<Character[]>(`/stories/${storyId}/characters`),
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
		update: (storyId: string, charId: string, data: CharacterUpdate) =>
			request<Character>(`/stories/${storyId}/characters/${charId}`, {
				body: JSON.stringify(data),
				method: 'PATCH',
			}),
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
					body: JSON.stringify(data),
					method: 'PATCH',
				},
			),
	},

	chats: {
		create: (
			storyId: string,
			data: Omit<ChatCreate, 'storyId'> & { startingLocationId?: string },
		) =>
			request<Chat>(`/stories/${storyId}/chats`, {
				body: JSON.stringify(data),
				method: 'POST',
			}),
		delete: (storyId: string, chatId: string) =>
			request<{ ok: boolean }>(`/stories/${storyId}/chats/${chatId}`, {
				method: 'DELETE',
			}),
		deleteAfterTurn: (storyId: string, chatId: string, turnId: string) =>
			request<{ ok: boolean }>(
				`/stories/${storyId}/chats/${chatId}/turns/${turnId}/after`,
				{
					method: 'DELETE',
				},
			),
		deleteTurn: (storyId: string, chatId: string, turnId: string) =>
			request<{ ok: boolean }>(
				`/stories/${storyId}/chats/${chatId}/turns/${turnId}`,
				{
					method: 'DELETE',
				},
			),
		editTurn: (
			storyId: string,
			chatId: string,
			turnId: string,
			text: string,
		) =>
			request<Turn>(
				`/stories/${storyId}/chats/${chatId}/turns/${turnId}`,
				{
					body: JSON.stringify({ text }),
					method: 'PATCH',
				},
			),
		get: (storyId: string, chatId: string) =>
			request<Chat>(`/stories/${storyId}/chats/${chatId}`),
		history: (storyId: string, chatId: string) =>
			request<Turn[]>(`/stories/${storyId}/chats/${chatId}/history`),
		list: (storyId: string) => request<Chat[]>(`/stories/${storyId}/chats`),
		seed: (storyId: string, chatId: string, text: string) =>
			request<Turn>(`/stories/${storyId}/chats/${chatId}/seed`, {
				body: JSON.stringify({ text }),
				method: 'POST',
			}),
		update: (
			storyId: string,
			chatId: string,
			data: { title?: string; mode?: string },
		) =>
			request<Chat>(`/stories/${storyId}/chats/${chatId}`, {
				body: JSON.stringify(data),
				method: 'PATCH',
			}),
	},

	fieldDefs: {
		create: (storyId: string, data: EntityFieldDefCreate) =>
			request<EntityFieldDef>(`/stories/${storyId}/field-defs`, {
				body: JSON.stringify(data),
				method: 'POST',
			}),
		delete: (storyId: string, defId: string) =>
			request<{ ok: boolean }>(
				`/stories/${storyId}/field-defs/${defId}`,
				{
					method: 'DELETE',
				},
			),
		list: (storyId: string, entityType?: string) =>
			request<EntityFieldDef[]>(
				`/stories/${storyId}/field-defs${entityType ? `?entityType=${encodeURIComponent(entityType)}` : ''}`,
			),
		update: (storyId: string, defId: string, data: EntityFieldDefUpdate) =>
			request<EntityFieldDef>(`/stories/${storyId}/field-defs/${defId}`, {
				body: JSON.stringify(data),
				method: 'PATCH',
			}),
	},

	locations: {
		create: (storyId: string, data: LocationCreate) =>
			request<Location>(`/stories/${storyId}/locations`, {
				body: JSON.stringify(data),
				method: 'POST',
			}),
		delete: (storyId: string, locationId: string) =>
			request<{ ok: boolean }>(
				`/stories/${storyId}/locations/${locationId}`,
				{
					method: 'DELETE',
				},
			),
		list: (storyId: string) =>
			request<Location[]>(`/stories/${storyId}/locations`),
		update: (storyId: string, locationId: string, data: LocationUpdate) =>
			request<Location>(`/stories/${storyId}/locations/${locationId}`, {
				body: JSON.stringify(data),
				method: 'PATCH',
			}),
	},

	ollama: {
		health: () => request<{ ok: boolean }>('/ollama/health'),
		models: () =>
			request<{ name: string; model: string }[]>('/ollama/models'),
	},

	settings: {
		get: () => request<AppSettings>('/settings'),
		update: (data: Partial<AppSettings>) =>
			request<AppSettings>('/settings', {
				body: JSON.stringify(data),
				method: 'PATCH',
			}),
	},
	stories: {
		create: (data: StoryCreate) =>
			request<Story>('/stories', {
				body: JSON.stringify(data),
				method: 'POST',
			}),
		delete: (id: string) =>
			request<{ ok: boolean }>(`/stories/${id}`, { method: 'DELETE' }),
		get: (id: string) =>
			request<{
				story: Story;
				characters: Character[];
				locations: Location[];
			}>(`/stories/${id}`),
		list: () => request<Story[]>('/stories'),
		update: (id: string, data: StoryUpdate) =>
			request<Story>(`/stories/${id}`, {
				body: JSON.stringify(data),
				method: 'PATCH',
			}),
	},
};
