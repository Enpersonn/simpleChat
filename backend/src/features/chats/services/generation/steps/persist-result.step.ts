import { randomUUID } from "node:crypto";
import type { Turn } from "@simplechat/types";
import { appendTurn } from "../../../store";
import type { GenerationContext } from "../../../types";

export const persistAssistantTurn = async (ctx: GenerationContext) => {
  const assistantTurn: Turn = {
    id: randomUUID(),
    chatId: ctx.chatId,
    speaker: ctx.activeSpeaker,
    role: "assistant",
    text: ctx.assistantText,
    timestamp: new Date().toISOString(),
    pinned: false,
    meta: { mode: ctx.chat.mode },
  };

  await appendTurn(assistantTurn);

  ctx.turns.push(assistantTurn);
};
