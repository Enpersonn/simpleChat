import {
  CharacterMemoryRelationSchema,
  type MemoryDeltaEffect,
  type MemoryItem,
  MemoryItemSchema,
} from "@simplechat/types";
import { BaseStorageObject } from "../base";

export const memories_store = new BaseStorageObject(
  "memories",
  MemoryItemSchema,
);

export const character_memories_store = new BaseStorageObject(
  "character_memories",
  CharacterMemoryRelationSchema,
);

export const getCharacterMemories = async (charId: string) => {
  const memories = await memories_store.list();
  const characterMemoryRelation = await character_memories_store.list({
    characterId: charId,
  });
  const characterMemoryList = characterMemoryRelation.map((x) => x.memoryid);
  return memories.filter((x) => characterMemoryList.includes(x.id));
};

export function getMemoryChain(
  memoryId: string,
  memories: MemoryItem[],
): MemoryItem[] {
  const byId = new Map(memories.map((memory) => [memory.id, memory]));

  const chain: MemoryItem[] = [];
  const visited = new Set<string>();

  let current = byId.get(memoryId);

  while (current) {
    if (visited.has(current.id)) {
      throw new Error(`Memory chain cycle detected at memory ${current.id}`);
    }

    visited.add(current.id);
    chain.push(current);

    if (!current.previousMemoryId) break;

    current = byId.get(current.previousMemoryId);
  }

  return chain;
}

type AnyState = Record<string, any>;

function getPath(obj: AnyState, path: string) {
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

function setPath(obj: AnyState, path: string, value: unknown) {
  const keys = path.split(".");
  const last = keys.pop()!;

  let target = obj;

  for (const key of keys) {
    target[key] ??= {};
    target = target[key];
  }

  target[last] = value;
}

function applyEffect(state: AnyState, effect: MemoryDeltaEffect) {
  const current = getPath(state, effect.path);

  switch (effect.op) {
    case "set":
      setPath(state, effect.path, effect.value);
      break;

    case "unset":
      setPath(state, effect.path, undefined);
      break;

    case "add": {
      const list = Array.isArray(current) ? current : [];
      if (!list.includes(effect.value)) {
        setPath(state, effect.path, [...list, effect.value]);
      }
      break;
    }

    case "remove": {
      const list = Array.isArray(current) ? current : [];
      setPath(
        state,
        effect.path,
        list.filter((item) => item !== effect.value),
      );
      break;
    }

    case "increment": {
      const base = typeof current === "number" ? current : 0;
      const amount = typeof effect.value === "number" ? effect.value : 0;
      setPath(state, effect.path, base + amount * effect.weight);
      break;
    }

    case "decrement": {
      const base = typeof current === "number" ? current : 0;
      const amount = typeof effect.value === "number" ? effect.value : 0;
      setPath(state, effect.path, base - amount * effect.weight);
      break;
    }
  }

  return state;
}

export function deriveMemoryState(memories: MemoryItem[]) {
  const state: AnyState = {};

  for (const memory of memories) {
    for (const effect of memory.deltas.effects) {
      applyEffect(state, effect);
    }
  }

  return state;
}
