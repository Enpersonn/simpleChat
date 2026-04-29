import { randomUUID } from "node:crypto";
import { SendMessageSchema, type Turn } from "@simplechat/types";
import type { FastifyInstance } from "fastify";
import { chatGenerationService } from "../services/generation/chat-generation-service";
import { appendTurn, chat_store } from "../store";

export async function chatGenerationRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post<{ Params: { storyId: string; chatId: string } }>(
    "/stories/:storyId/chats/:chatId/message",
    async (req, reply) => {
      const body = SendMessageSchema.safeParse(req.body);
      if (!body.success) {
        return reply.status(400).send({ error: body.error.flatten() });
      }

      await chatGenerationService.run({
        kind: "message",
        storyId: req.params.storyId,
        chatId: req.params.chatId,
        params: body.data,
        req,
        reply,
      });
    },
  );

  app.post<{ Params: { storyId: string; chatId: string } }>(
    "/stories/:storyId/chats/:chatId/regenerate",
    async (req, reply) => {
      const body = SendMessageSchema.partial().safeParse(req.body ?? {});
      if (!body.success) {
        return reply.status(400).send({ error: body.error.flatten() });
      }

      await chatGenerationService.run({
        kind: "regenerate",
        storyId: req.params.storyId,
        chatId: req.params.chatId,
        params: body.data,
        req,
        reply,
      });
    },
  );

  app.post<{ Params: { storyId: string; chatId: string } }>(
    "/stories/:storyId/chats/:chatId/seed",
    async (req, reply) => {
      const { chatId } = req.params;
      const { text } = req.body as { text?: string };
      if (!text?.trim())
        return reply.status(400).send({ error: "text is required" });
      const chat = await chat_store.get(chatId);
      if (!chat) return reply.status(404).send({ error: "Chat not found" });
      const turn: Turn = {
        id: randomUUID(),
        chatId,
        speaker: chat.activeSpeakers[0] ?? "narrator",
        role: "assistant",
        text: text.trim(),
        timestamp: new Date().toISOString(),
        pinned: false,
        meta: { mode: chat.mode },
      };
      await appendTurn(turn);
      return reply.status(201).send(turn);
    },
  );

  app.post<{ Params: { storyId: string; chatId: string } }>(
    "/stories/:storyId/chats/:chatId/opener",
    async (req, reply) => {
      await chatGenerationService.run({
        kind: "opener",
        storyId: req.params.storyId,
        chatId: req.params.chatId,
        params: {},
        req,
        reply,
      });
    },
  );
}
