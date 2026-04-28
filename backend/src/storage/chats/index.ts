import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ChatEntityStateSchema,
  ChatSchema,
  type Turn,
  TurnSchema,
} from "@simplechat/types";
import { BaseStorageObject } from "../base";
import { storyDir } from "../helpers";

async function chatLogPath(storyId: string, chatId: string): Promise<string> {
  const dir = await storyDir(storyId);
  return join(dir, "chats", `${chatId}.jsonl`);
}

export const chat_store = new BaseStorageObject("characters", ChatSchema);
export const turn_store = new BaseStorageObject("characters", TurnSchema);
export const chat_state_store = new BaseStorageObject(
  "characters",
  ChatEntityStateSchema,
);

export async function appendTurn(turn: Turn): Promise<void> {
  await turn_store.add(turn);
  await chat_store.update(turn.chatId, {});
}

export async function deleteAfterTurn(
  storyId: string,
  chatId: string,
  turnId: string,
): Promise<boolean> {
  const turns = await turn_store.list({ chatId });
  const idx = turns.findIndex((t) => t.id === turnId);
  if (idx === -1) return false;
  const remaining = turns.slice(0, idx + 1);
  const path = await chatLogPath(storyId, chatId);
  await writeFile(
    path,
    `${remaining.map((t) => JSON.stringify(t)).join("\n")}\n`,
  );
  return true;
}

export async function deleteSingleTurn(
  storyId: string,
  chatId: string,
  turnId: string,
): Promise<boolean> {
  const turns = await turn_store.list({ chatId });
  const filtered = turns.filter((t) => t.id !== turnId);
  if (filtered.length === turns.length) return false;
  const path = await chatLogPath(storyId, chatId);
  await writeFile(
    path,
    filtered.map((t) => JSON.stringify(t)).join("\n") +
      (filtered.length ? "\n" : ""),
  );
  return true;
}
