import { defineTool, type FunctionTool } from '@llm-helpers/tools';
import { z } from 'zod';
import { characters_store } from '../../../features/characters/store';
import {
	chat_state_store,
	chat_store,
	turn_store,
} from '../../../features/chats/store';
import { locations_store } from '../../../features/locations/store';
import {
	character_memory_relations_store,
	getMemoryChainForCharacter,
	memories_store,
} from '../../../features/memories/store/index';
import { stories_store } from '../../../features/stories/store';
import {
	addCanonEntry,
	getCanonTimeline,
	removeCanonEntry,
	reorderCanonTimeline,
} from '../../../features/timeline/store';
import { field_defs_store } from '../../../storage/field-defs/index';

export const getAllTools = (): FunctionTool[] => [
	...stories_store.asTools(),
	...characters_store.asTools(),
	...locations_store.asTools(),
	...chat_store.asTools(),
	...turn_store.asTools(),
	...chat_state_store.asTools(),
	...memories_store.asTools(),
	...character_memory_relations_store.asTools(),
	...field_defs_store.asTools(),

	defineTool({
		name: 'memories.getChainForCharacter',
		description:
			'Get the ordered memory chain for a character from a given anchor relation, or from the natural head if no anchor is given',
		input: z.object({
			charId: z.string(),
			fromRelationId: z.string().optional(),
		}),
		execute: ({ charId, fromRelationId }, _ctx) =>
			getMemoryChainForCharacter(charId, fromRelationId),
	}),

	defineTool({
		name: 'timeline.get',
		description: 'Get the full canon timeline for a story',
		input: z.object({ storyId: z.string() }),
		execute: ({ storyId }, _ctx) => getCanonTimeline(storyId),
	}),

	defineTool({
		name: 'timeline.addEntry',
		description: 'Append a new entry to the canon timeline for a story',
		input: z.object({ storyId: z.string(), data: z.record(z.string(), z.unknown()) }),
		execute: ({ storyId, data }, _ctx) => addCanonEntry(storyId, data as any),
	}),

	defineTool({
		name: 'timeline.removeEntry',
		description: 'Remove an entry from the canon timeline by entry id',
		input: z.object({ storyId: z.string(), entryId: z.string() }),
		execute: ({ storyId, entryId }, _ctx) => removeCanonEntry(storyId, entryId),
	}),

	defineTool({
		name: 'timeline.reorder',
		description:
			'Reorder canon timeline entries by providing the desired entry id order',
		input: z.object({
			storyId: z.string(),
			orderedEntryIds: z.array(z.string()),
		}),
		execute: ({ storyId, orderedEntryIds }, _ctx) =>
			reorderCanonTimeline(storyId, orderedEntryIds),
	}),
];
