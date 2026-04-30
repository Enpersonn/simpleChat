import { z } from "zod";
import { characters_store } from "../../../features/characters/store";
import {
  chat_state_store,
  chat_store,
  turn_store,
} from "../../../features/chats/store";
import { locations_store } from "../../../features/locations/store";
import {
  character_memory_relations_store,
  getMemoryChainForCharacter,
  memories_store,
} from "../../../features/memories/store/index";
import { stories_store } from "../../../features/stories/store";
import {
  addCanonEntry,
  getCanonTimeline,
  removeCanonEntry,
  reorderCanonTimeline,
} from "../../../features/timeline/store";
import { field_defs_store } from "../../../storage/field-defs/index";
import type { Tool } from "../register-tool";

export const getAllTools = (): Tool<any, any>[] => [
  ...stories_store.asTools(),
  ...characters_store.asTools(),
  ...locations_store.asTools(),
  ...chat_store.asTools(),
  ...turn_store.asTools(),
  ...chat_state_store.asTools(),
  ...memories_store.asTools(),
  ...character_memory_relations_store.asTools(),
  ...field_defs_store.asTools(),

  {
    name: "memories.getChainForCharacter",
    description:
      "Get the ordered memory chain for a character from a given anchor relation, or from the natural head if no anchor is given",
    schema: z.object({
      charId: z.string(),
      fromRelationId: z.string().optional(),
    }),
    execute: ({
      charId,
      fromRelationId,
    }: {
      charId: string;
      fromRelationId?: string;
    }) => getMemoryChainForCharacter(charId, fromRelationId),
  },

  {
    name: "timeline.get",
    description: "Get the full canon timeline for a story",
    schema: z.object({ storyId: z.string() }),
    execute: ({ storyId }: { storyId: string }) => getCanonTimeline(storyId),
  },
  {
    name: "timeline.addEntry",
    description: "Append a new entry to the canon timeline for a story",
    schema: z.object({ storyId: z.string(), data: z.record(z.unknown()) }),
    execute: ({
      storyId,
      data,
    }: {
      storyId: string;
      data: Record<string, unknown>;
    }) => addCanonEntry(storyId, data as any),
  },
  {
    name: "timeline.removeEntry",
    description: "Remove an entry from the canon timeline by entry id",
    schema: z.object({ storyId: z.string(), entryId: z.string() }),
    execute: ({ storyId, entryId }: { storyId: string; entryId: string }) =>
      removeCanonEntry(storyId, entryId),
  },
  {
    name: "timeline.reorder",
    description:
      "Reorder canon timeline entries by providing the desired entry id order",
    schema: z.object({
      storyId: z.string(),
      orderedEntryIds: z.array(z.string()),
    }),
    execute: ({
      storyId,
      orderedEntryIds,
    }: {
      storyId: string;
      orderedEntryIds: string[];
    }) => reorderCanonTimeline(storyId, orderedEntryIds),
  },
];
