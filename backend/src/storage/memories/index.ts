import {
  type MemoryDeltaEffect,
  type MemoryItem,
  MemoryItemSchema,
} from "@simplechat/types";
import { BaseStorageObject } from "../base.js";
import {
  character_memory_relations_store,
  getCharacterRelations,
  getRelationChain,
  getRelationHeads,
} from "./relations.js";

export { character_memory_relations_store, getRelationHeads, getRelationChain };

export const memories_store = new BaseStorageObject("memories", MemoryItemSchema);

export async function getMemoryChainForCharacter(
  charId: string,
  fromRelationId?: string,
): Promise<MemoryItem[]> {
  const allRelations = await getCharacterRelations(charId);
  if (allRelations.length === 0) return [];

  let headRelation: typeof allRelations[0] | undefined;
  if (fromRelationId) {
    headRelation = allRelations.find((r) => r.id === fromRelationId);
  }
  if (!headRelation) {
    const heads = await getRelationHeads(charId);
    headRelation = heads.sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )[0];
  }
  if (!headRelation) return [];

  const chain = getRelationChain(headRelation.id, allRelations);
  const items = await Promise.all(
    chain.map((r) => memories_store.get(r.memoryId)),
  );
  return items.filter((m): m is MemoryItem => m !== null);
}

type AnyState = Record<string, unknown>;

function getPath(obj: AnyState, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc != null && typeof acc === "object") {
      return (acc as AnyState)[key];
    }
    return undefined;
  }, obj);
}

function setPath(obj: AnyState, path: string, value: unknown): void {
  const keys = path.split(".");
  const last = keys.pop()!;
  let target = obj;
  for (const key of keys) {
    if (target[key] == null || typeof target[key] !== "object") {
      target[key] = {};
    }
    target = target[key] as AnyState;
  }
  target[last] = value;
}

export function applyEffect(
  state: AnyState,
  effect: MemoryDeltaEffect,
): AnyState {
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

export function deriveMemoryState(memories: MemoryItem[]): AnyState {
  const state: AnyState = {};
  for (const memory of memories) {
    for (const effect of memory.deltas.effects) {
      applyEffect(state, effect);
    }
  }
  return state;
}
