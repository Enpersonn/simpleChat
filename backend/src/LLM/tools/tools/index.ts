import { defineTool, type FunctionTool } from '@llm-helpers/tools';
import { z } from 'zod';
import { characters_store } from '../../../features/characters/store.js';
import {
	chat_state_store,
	chat_store,
	turn_store,
} from '../../../features/chats/store.js';
import { locations_store } from '../../../features/locations/store.js';
import {
	character_memory_relations_store,
	getMemoryChainForCharacter,
	memories_store,
} from '../../../features/memories/store/index.js';
import { stories_store } from '../../../features/stories/store.js';
import {
	addCanonEntry,
	getCanonTimeline,
	removeCanonEntry,
	reorderCanonTimeline,
} from '../../../features/timeline/store.js';
import { field_defs_store } from '../../../storage/field-defs/index.js';

const createReadTools = (): FunctionTool[] => [
	...stories_store.asReadTools(),
	...characters_store.asReadTools(),
	...locations_store.asReadTools(),
	...chat_store.asReadTools(),
	...turn_store.asReadTools(),
	...chat_state_store.asReadTools(),
	...memories_store.asReadTools(),
	...character_memory_relations_store.asReadTools(),
	...field_defs_store.asReadTools(),

	defineTool({
		description:
			'Get the ordered memory chain for a character from a given anchor relation, or from the natural head if no anchor is given',
		execute: ({ charId, fromRelationId }, _ctx) =>
			getMemoryChainForCharacter(charId, fromRelationId),
		input: z.object({
			charId: z.string(),
			fromRelationId: z.string().optional(),
		}),
		name: 'memories.getChainForCharacter',
	}),

	defineTool({
		description: 'Get the full canon timeline for a story',
		execute: ({ storyId }, _ctx) => getCanonTimeline(storyId),
		input: z.object({ storyId: z.string() }),
		name: 'timeline.get',
	}),
];

const createWriteTools = (): FunctionTool[] => [
	...stories_store.asWriteTools(),
	...characters_store.asWriteTools(),
	...locations_store.asWriteTools(),
	...chat_store.asWriteTools(),
	...turn_store.asWriteTools(),
	...chat_state_store.asWriteTools(),
	...memories_store.asWriteTools(),
	...character_memory_relations_store.asWriteTools(),
	...field_defs_store.asWriteTools(),
	defineTool({
		description: 'Append a new entry to the canon timeline for a story',
		execute: ({ storyId, data }, _ctx) =>
			addCanonEntry(storyId, data as any),
		input: z.object({
			data: z.record(z.string(), z.unknown()),
			storyId: z.string(),
		}),
		name: 'timeline.addEntry',
	}),

	defineTool({
		description: 'Remove an entry from the canon timeline by entry id',
		execute: ({ storyId, entryId }, _ctx) =>
			removeCanonEntry(storyId, entryId),
		input: z.object({ entryId: z.string(), storyId: z.string() }),
		name: 'timeline.removeEntry',
	}),

	defineTool({
		description:
			'Reorder canon timeline entries by providing the desired entry id order',
		execute: ({ storyId, orderedEntryIds }, _ctx) =>
			reorderCanonTimeline(storyId, orderedEntryIds),
		input: z.object({
			orderedEntryIds: z.array(z.string()),
			storyId: z.string(),
		}),
		name: 'timeline.reorder',
	}),
];

export const getStoryReadTools = (): FunctionTool[] => createReadTools();

export const getStoryWriteTools = (): FunctionTool[] => createWriteTools();

export const getAllTools = (): FunctionTool[] => [
	...getStoryReadTools(),
	...getStoryWriteTools(),
];
