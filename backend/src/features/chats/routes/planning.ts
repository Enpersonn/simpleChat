import { randomUUID } from "node:crypto";
import type { DmProposal, Turn } from "@simplechat/types";
import type { FastifyInstance } from "fastify";
import { streamChat } from "../../../LLM/ollama";
import { characters_store } from "../../characters/store";
import { locations_store } from "../../locations/store";
import { dmProposalExtractorAgent } from "../../stories/generation-agents";
import { stories_store } from "../../stories/store";
import { buildDmSystemPrompt } from "../helpers";
import { appendTurn, chat_store, turn_store } from "../store";

export async function DmPlaningRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { storyId: string; chatId: string } }>(
    "/stories/:storyId/chats/:chatId/plan-message",
    async (req, reply) => {
      const { storyId, chatId } = req.params;
      const { text, model } = req.body as { text?: string; model?: string };
      if (!text?.trim())
        return reply.status(400).send({ error: "text is required" });

      const [story, chat, characters, locations, existingTurns] =
        await Promise.all([
          stories_store.get(storyId),
          chat_store.get(chatId),
          characters_store.list({ storyId }),
          locations_store.list({ storyId }),
          turn_store.list({ chatId }),
        ]);

      if (!story) return reply.status(404).send({ error: "Story not found" });
      if (!chat) return reply.status(404).send({ error: "Chat not found" });
      if (chat.mode !== "planning")
        return reply.status(400).send({ error: "Chat is not a planning chat" });

      const userTurn: Turn = {
        id: randomUUID(),
        chatId,
        speaker: "user",
        role: "user",
        text: text.trim(),
        timestamp: new Date().toISOString(),
        pinned: false,
        meta: { mode: "planning" },
      };
      await appendTurn(userTurn);

      const allTurns = [...existingTurns, userTurn];

      const allowedOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];
      const reqOrigin = req.headers.origin ?? "";
      const corsOrigin = allowedOrigins.includes(reqOrigin)
        ? reqOrigin
        : allowedOrigins[0];
      reply.raw.writeHead(200, {
        "Content-Type": "application/x-ndjson",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": corsOrigin,
      });

      const systemPrompt = buildDmSystemPrompt(story, characters, locations);

      const messages: Array<{
        role: "system" | "user" | "assistant";
        content: string;
      }> = [
        { role: "system", content: systemPrompt },
        ...allTurns.map((t) => ({
          role: t.role as "user" | "assistant",
          content: t.text,
        })),
      ];

      let fullText = "";
      try {
        fullText = await streamChat({
          messages,
          model: model || undefined,
          temperature: 0.85,
          onChunk: (chunk) => {
            reply.raw.write(JSON.stringify({ content: chunk }) + "\n");
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stream error";
        reply.raw.write(JSON.stringify({ error: msg }) + "\n");
        reply.raw.end();
        return;
      }

      if (fullText) {
        await appendTurn({
          id: randomUUID(),
          chatId,
          speaker: "dm",
          role: "assistant",
          text: fullText,
          timestamp: new Date().toISOString(),
          pinned: false,
          meta: { mode: "planning" },
        });

        const charNames = characters.map((c) => c.name).join(", ");
        const extractorInput = [
          `Story: ${story.title}`,
          charNames ? `Existing characters: ${charNames}` : "",
          `DM response:\n${fullText}`,
        ]
          .filter(Boolean)
          .join("\n");

        let proposals: DmProposal[] = [];
        try {
          const extracted = await dmProposalExtractorAgent.run(extractorInput);
          const raw = Array.isArray(extracted.proposals)
            ? (extracted.proposals as unknown[])
            : [];
          proposals = raw
            .filter(
              (p): p is Record<string, unknown> => !!p && typeof p === "object",
            )
            .map((p) => ({
              id: randomUUID(),
              type: (p.type as DmProposal["type"]) ?? "character",
              rationale: typeof p.rationale === "string" ? p.rationale : "",
              entityData:
                p.entityData && typeof p.entityData === "object"
                  ? (p.entityData as Record<string, unknown>)
                  : {},
            }))
            .filter((p) =>
              ["character", "location", "memory"].includes(p.type),
            );
        } catch {
          // non-fatal: proposals remain empty
        }

        reply.raw.write(JSON.stringify({ proposals }) + "\n");
      }

      reply.raw.write(JSON.stringify({ done: true }) + "\n");
      reply.raw.end();
    },
  );
}
