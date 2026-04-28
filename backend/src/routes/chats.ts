import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import {
  type Character,
  ChatCreateSchema,
  ChatEntityStateSchema,
  type DmProposal,
  type LocationCreate,
  type MemoryItem,
  MemoryItemCreateSchema,
  type MemoryItemSchema,
  SendMessageSchema,
  type Story,
  type Turn,
} from "@simplechat/types";
import type { FastifyInstance } from "fastify";
import { applyMemoryChain } from "../character-state.js";
import { getSettings } from "../config.js";
import { assembleContext } from "../context.js";
import { runExtraction } from "../extraction.js";
import { dmProposalExtractorAgent } from "../generation/agents.js";
import {
  findRelevantMemories,
  type MemoryReason,
} from "../memory-retrieval.js";
import { activeModel, streamChat } from "../ollama.js";
import { characters_store } from "../storage/characters/index.js";
import {
  appendTurn,
  chat_state_store,
  chat_store,
  deleteAfterTurn,
  deleteSingleTurn,
  turn_store,
} from "../storage/chats";
import { now } from "../storage/helpers.js";
import { locations_store } from "../storage/locations/index.js";
import {
  getMemoryChainForCharacter,
  memories_store,
} from "../storage/memories/index.js";
import { stories_store } from "../storage/stories/index.js";
import { extractJson } from "../utils.js";

// ── Pipeline event helpers ────────────────────────────────────────────────────

type PipelineStep =
  | "data_load"
  | "memory_chain"
  | "memory_retrieval"
  | "context_assembly"
  | "llm_call"
  | "extraction";

function emitFrame(raw: ServerResponse, frame: object): void {
  raw.write(`${JSON.stringify(frame)}\n`);
}

function emitPipeline(
  raw: ServerResponse,
  step: PipelineStep,
  status: "start" | "complete" | "error",
  startedAt?: number,
  data?: object,
): void {
  const event: Record<string, unknown> = { step, status };
  if (startedAt !== undefined && status !== "start") {
    event.durationMs = Date.now() - startedAt;
  }
  if (data !== undefined && status === "complete") {
    event.data = data;
  }
  raw.write(`${JSON.stringify({ pipelineEvent: event })}\n`);
}

function buildChainDiffs(
  characters: Character[],
  effectiveCharacters: Character[],
  chains: MemoryItem[][],
) {
  return characters.map((base, i) => {
    const eff = effectiveCharacters[i];
    return {
      characterId: base.id,
      characterName: base.name,
      chainLength: chains[i].length,
      hasGenesisMemory: !!base.genesisMemoryId,
      effectiveDiff: {
        personalityAdded: eff.public.personality.filter(
          (t) => !base.public.personality.includes(t),
        ),
        personalityRemoved: base.public.personality.filter(
          (t) => !eff.public.personality.includes(t),
        ),
        fearsAdded: eff.private.fears.filter(
          (f) => !base.private.fears.includes(f),
        ),
        speechStyleChanged: eff.public.speechStyle !== base.public.speechStyle,
        trueMotivestChanged:
          eff.private.trueMotives !== base.private.trueMotives,
        hiddenEmotionalStateChanged:
          eff.private.hiddenEmotionalState !==
          base.private.hiddenEmotionalState,
      },
    };
  });
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function chatsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { storyId: string } }>(
    "/stories/:storyId/chats",
    async (req) => {
      return chat_store.list({ storyId: req.params.storyId });
    },
  );

  app.post<{ Params: { storyId: string } }>(
    "/stories/:storyId/chats",
    async (req, reply) => {
      const body = ChatCreateSchema.safeParse({
        ...(req.body as object),
        storyId: req.params.storyId,
      });
      if (!body.success)
        return reply.status(400).send({ error: body.error.flatten() });
      const chat = await chat_store.add(body.data);
      if (body.data.startingLocationId) {
        await chat_state_store.update(
          chat.id,
          ChatEntityStateSchema.parse({
            chatId: chat.id,
            storyId: req.params.storyId,
            currentLocationId: body.data.startingLocationId,
            locationOverrides: {},
            updatedAt: new Date().toISOString(),
          }),
        );
      }
      return reply.status(201).send(chat);
    },
  );

  app.get<{ Params: { storyId: string; chatId: string } }>(
    "/stories/:storyId/chats/:chatId",
    async (req, reply) => {
      const chat = await chat_store.get(req.params.chatId);
      if (!chat) return reply.status(404).send({ error: "Chat not found" });
      return chat;
    },
  );

  app.get<{ Params: { storyId: string; chatId: string } }>(
    "/stories/:storyId/chats/:chatId/history",
    async (req, reply) => {
      const chat = await chat_store.get(req.params.chatId);
      if (!chat) return reply.status(404).send({ error: "Chat not found" });
      const turns = await turn_store.list({ chatId: req.params.chatId });
      return turns;
    },
  );

  // ─── Chat entity state ────────────────────────────────────────────────────

  app.get<{ Params: { storyId: string; chatId: string } }>(
    "/stories/:storyId/chats/:chatId/state",
    async (req, reply) => {
      const chat = await chat_store.get(req.params.chatId);
      if (!chat) return reply.status(404).send({ error: "Chat not found" });
      return chat_state_store.get(req.params.chatId);
    },
  );

  app.patch<{ Params: { storyId: string; chatId: string } }>(
    "/stories/:storyId/chats/:chatId/state",
    async (req, reply) => {
      const chat = await chat_store.get(req.params.chatId);
      if (!chat) return reply.status(404).send({ error: "Chat not found" });
      const body = ChatEntityStateSchema.partial().safeParse(req.body);
      if (!body.success)
        return reply.status(400).send({ error: body.error.flatten() });
      const updated = chat_state_store.update(req.params.chatId, body.data);
      return updated;
    },
  );

  // ─── Send message (streaming) ─────────────────────────────────────────────

  app.post<{ Params: { storyId: string; chatId: string } }>(
    "/stories/:storyId/chats/:chatId/message",
    async (req, reply) => {
      const { storyId, chatId } = req.params;
      const body = SendMessageSchema.safeParse(req.body);
      if (!body.success)
        return reply.status(400).send({ error: body.error.flatten() });

      const [story, chat, characters, existingTurns, locations, chatState] =
        await Promise.all([
          stories_store.get(storyId),
          chat_store.get(chatId),
          characters_store.list({ storyId }),
          turn_store.list({ chatId }),
          locations_store.list({ storyId }),
          chat_state_store.get(chatId),
        ]);

      if (!story) return reply.status(404).send({ error: "Story not found" });
      if (!chat) return reply.status(404).send({ error: "Chat not found" });
      if (!chatState)
        return reply.status(404).send({ error: "Chat state not found" });

      const {
        text,
        speaker,
        moodTags,
        responseLength,
        feelText,
        temperature,
        top_p,
        top_k,
        repeat_penalty,
        model,
      } = body.data;

      const userTurn: Turn = {
        id: randomUUID(),
        chatId,
        speaker,
        role: "user",
        text,
        timestamp: new Date().toISOString(),
        pinned: false,
        meta: { mode: chat.mode },
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

      emitPipeline(reply.raw, "data_load", "complete", undefined, {
        characterCount: characters.length,
        locationCount: locations.length,
        turnCount: allTurns.length,
      });

      // ── Memory chain ──────────────────────────────────────────────────────

      let t = Date.now();
      emitPipeline(reply.raw, "memory_chain", "start");

      const characterChains = await resolveCharacterChains(
        characters,
        chat.memoryTimelineCutoff,
      );
      const effectiveCharacters = characters.map((c, i) => {
        const chain = characterChains[i];
        return chain.length > 0 ? applyMemoryChain(c, chain) : c;
      });

      emitPipeline(reply.raw, "memory_chain", "complete", t, {
        chains: buildChainDiffs(
          characters,
          effectiveCharacters,
          characterChains,
        ),
      });

      // ── Memory retrieval ──────────────────────────────────────────────────

      const activeSpeaker = chat.activeSpeakers[0] ?? "narrator";
      const activeSpeakerIdx =
        activeSpeaker === "narrator"
          ? -1
          : characters.findIndex((c) => c.id === activeSpeaker);
      const accessibleMemories =
        activeSpeakerIdx >= 0 ? characterChains[activeSpeakerIdx] : [];

      t = Date.now();
      emitPipeline(reply.raw, "memory_retrieval", "start");

      const memResult = await findRelevantMemories(
        accessibleMemories,
        allTurns,
      );
      const relevantMemories = memResult.memories;

      emitPipeline(reply.raw, "memory_retrieval", "complete", t, {
        accessibleCount: accessibleMemories.length,
        results: memResult.details.map((d) => ({
          memoryId: d.memory.id,
          summary: d.memory.summary.slice(0, 100),
          reason: d.reason,
          score: d.score,
          tags: d.memory.tags,
        })),
        llmFallbackFired: memResult.llmFallbackFired,
      });

      // ── Context assembly ──────────────────────────────────────────────────

      const speakerChar = characters.find((c) => c.id === activeSpeaker);
      const effectiveModel = speakerChar?.modelOverride || model || undefined;
      const settings = await getSettings();

      const currentLocation = chatState.currentLocationId
        ? locations.find((l) => l.id === chatState.currentLocationId)
        : undefined;
      const locationOverrides = chatState.currentLocationId
        ? chatState.locationOverrides[chatState.currentLocationId]
        : undefined;

      const otherCharMemories = new Map<string, MemoryItem[]>();
      for (let i = 0; i < characters.length; i++) {
        const c = characters[i];
        if (c.id !== activeSpeaker && !c.isUserPersona) {
          otherCharMemories.set(c.id, characterChains[i]);
        }
      }

      t = Date.now();
      emitPipeline(reply.raw, "context_assembly", "start");

      const messages = assembleContext({
        story,
        characters: effectiveCharacters,
        activeSpeaker,
        recentTurns: allTurns,
        mode: chat.mode,
        moodTags,
        responseLength,
        feelText,
        globalNote: settings.globalNote,
        currentLocation,
        locationOverrides,
        locations,
        speakerMemories: relevantMemories,
        otherCharMemories,
      });

      const systemPromptText = messages[0]?.content ?? "";
      emitPipeline(reply.raw, "context_assembly", "complete", t, {
        systemPromptLength: systemPromptText.length,
        injectedMemoryIds: relevantMemories.map((m) => m.id),
        activeSpeakerId: activeSpeaker,
        currentLocationId: chatState.currentLocationId,
        moodTagCount: (moodTags ?? []).length,
      });

      // ── Context snapshot ──────────────────────────────────────────────────

      const resolvedModel = effectiveModel ?? (await activeModel());

      emitFrame(reply.raw, {
        contextSnapshot: {
          story: { id: story.id, title: story.title },
          activeSpeakerId: activeSpeaker,
          characters: characters.map((base, i) => {
            const eff = effectiveCharacters[i];
            return {
              id: base.id,
              name: base.name,
              role: base.role,
              isUserPersona: base.isUserPersona,
              isNarrator: base.isNarrator,
              basePersonality: base.public.personality,
              effectivePersonality: eff.public.personality,
              baseSpeechStyle: base.public.speechStyle ?? "",
              effectiveSpeechStyle: eff.public.speechStyle ?? "",
              baseTrueMotives: base.private.trueMotives ?? "",
              effectiveTrueMotives: eff.private.trueMotives ?? "",
              baseFears: base.private.fears,
              effectiveFears: eff.private.fears,
            };
          }),
          accessibleMemories: accessibleMemories.map((m) => ({
            id: m.id,
            summary: m.summary.slice(0, 100),
            tags: m.tags,
            importance: m.importance,
          })),
          injectedMemoryIds: relevantMemories.map((m) => m.id),
          memoryReasons: memResult.reasons,
          locations: locations.map((l) => ({
            id: l.id,
            name: l.name,
            isCurrent: l.id === chatState.currentLocationId,
          })),
          currentLocationId: chatState.currentLocationId,
          moodTags: moodTags ?? [],
          responseLength: responseLength ?? "medium",
          feelText: feelText ?? "",
          model: resolvedModel,
        },
      });

      emitFrame(reply.raw, {
        debug: { systemPrompt: systemPromptText, model: resolvedModel },
      });

      // ── LLM call ─────────────────────────────────────────────────────────

      t = Date.now();
      emitPipeline(reply.raw, "llm_call", "start");

      let fullText = "";
      try {
        fullText = await streamChat({
          messages,
          model: effectiveModel,
          temperature,
          top_p,
          top_k,
          repeat_penalty,
          onChunk: (chunk) => {
            reply.raw.write(JSON.stringify({ content: chunk }) + "\n");
          },
        });
      } catch (err) {
        emitPipeline(reply.raw, "llm_call", "error", t);
        const msg = err instanceof Error ? err.message : "Stream error";
        emitFrame(reply.raw, { error: msg });
        reply.raw.end();
        return;
      }

      emitPipeline(reply.raw, "llm_call", "complete", t, {
        model: resolvedModel,
        tokenCount: fullText.split(/\s+/).length,
        durationMs: Date.now() - t,
      });

      // ── Persist + extraction ──────────────────────────────────────────────

      if (fullText) {
        const assistantTurn: Turn = {
          id: randomUUID(),
          chatId,
          speaker: activeSpeaker,
          role: "assistant",
          text: fullText,
          timestamp: new Date().toISOString(),
          pinned: false,
          meta: { mode: chat.mode },
        };
        await appendTurn(assistantTurn);

        if (locations.length > 0) {
          t = Date.now();
          emitPipeline(reply.raw, "extraction", "start");
          try {
            const completedTurns = [...allTurns, assistantTurn];
            const extracted = await runExtraction({
              recentTurns: completedTurns.slice(-6),
              story,
              locations,
              currentState: chatState,
            });

            let finalState = extracted;
            let newLocationCreated = false;

            if (extracted.newLocationName) {
              const newLocFields = await generateLocationFromContext(
                extracted.newLocationName,
                story,
                completedTurns.slice(-4),
              );
              const newLoc = await locations_store.add({
                storyId,
                ...newLocFields,
              });
              locations.push(newLoc);
              finalState = {
                ...extracted,
                currentLocationId: newLoc.id,
                locationOverrides: {},
              };
              newLocationCreated = true;
            }

            await chat_state_store.update(chatId, finalState);

            const locationChanged =
              finalState.currentLocationId !== chatState.currentLocationId;
            const overridesChanged =
              JSON.stringify(finalState.locationOverrides) !==
              JSON.stringify(chatState.locationOverrides);

            emitPipeline(reply.raw, "extraction", "complete", t, {
              locationChanged,
              newLocationCreated,
              newLocationId: finalState.currentLocationId ?? null,
              newLocationName: extracted.newLocationName ?? null,
              overridesChanged,
            });

            if (locationChanged || overridesChanged || newLocationCreated) {
              const locationName = finalState.currentLocationId
                ? (locations.find((l) => l.id === finalState.currentLocationId)
                    ?.name ?? null)
                : null;
              emitFrame(reply.raw, {
                stateUpdate: {
                  currentLocationId: finalState.currentLocationId,
                  locationName,
                  newLocationCreated,
                },
              });
            }
          } catch {
            emitPipeline(reply.raw, "extraction", "error", t);
          }
        }
      }

      emitFrame(reply.raw, { done: true });
      reply.raw.end();
    },
  );

  // ─── Regenerate last assistant turn ──────────────────────────────────────

  app.post<{ Params: { storyId: string; chatId: string } }>(
    "/stories/:storyId/chats/:chatId/regenerate",
    async (req, reply) => {
      const { storyId, chatId } = req.params;
      const body = SendMessageSchema.partial().safeParse(req.body ?? {});
      const params = body.success ? body.data : {};

      const [story, chat, characters, locations, chatState] = await Promise.all(
        [
          stories_store.get(storyId),
          chat_store.get(chatId),
          characters_store.list({ storyId }),
          locations_store.list({ storyId }),
          chat_state_store.get(chatId),
        ],
      );
      if (!story) return reply.status(404).send({ error: "Story not found" });
      if (!chat) return reply.status(404).send({ error: "Chat not found" });
      if (!chatState)
        return reply.status(404).send({ error: "Chat state not found" });

      const turns = await turn_store.list({ chatId });
      const lastAssistant = [...turns]
        .reverse()
        .find((t) => t.role === "assistant");
      if (lastAssistant)
        await deleteSingleTurn(storyId, chatId, lastAssistant.id);

      const freshTurns = await turn_store.list({ chatId });

      const allowedOriginsRegen = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
      ];
      const reqOriginRegen = req.headers.origin ?? "";
      const corsOriginRegen = allowedOriginsRegen.includes(reqOriginRegen)
        ? reqOriginRegen
        : allowedOriginsRegen[0];
      reply.raw.writeHead(200, {
        "Content-Type": "application/x-ndjson",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": corsOriginRegen,
      });

      emitPipeline(reply.raw, "data_load", "complete", undefined, {
        characterCount: characters.length,
        locationCount: locations.length,
        turnCount: freshTurns.length,
      });

      // ── Memory chain ──────────────────────────────────────────────────────

      let t = Date.now();
      emitPipeline(reply.raw, "memory_chain", "start");

      const characterChains = await resolveCharacterChains(
        characters,
        chat.memoryTimelineCutoff,
      );
      const effectiveCharacters = characters.map((c, i) => {
        const chain = characterChains[i];
        return chain.length > 0 ? applyMemoryChain(c, chain) : c;
      });

      emitPipeline(reply.raw, "memory_chain", "complete", t, {
        chains: buildChainDiffs(
          characters,
          effectiveCharacters,
          characterChains,
        ),
      });

      // ── Memory retrieval ──────────────────────────────────────────────────

      const activeSpeaker = chat.activeSpeakers[0] ?? "narrator";
      const activeSpeakerIdx =
        activeSpeaker === "narrator"
          ? -1
          : characters.findIndex((c) => c.id === activeSpeaker);
      const accessibleMemories =
        activeSpeakerIdx >= 0 ? characterChains[activeSpeakerIdx] : [];

      t = Date.now();
      emitPipeline(reply.raw, "memory_retrieval", "start");

      const memResult = await findRelevantMemories(
        accessibleMemories,
        freshTurns,
      );
      const relevantMemories = memResult.memories;

      emitPipeline(reply.raw, "memory_retrieval", "complete", t, {
        accessibleCount: accessibleMemories.length,
        results: memResult.details.map((d) => ({
          memoryId: d.memory.id,
          summary: d.memory.summary.slice(0, 100),
          reason: d.reason,
          score: d.score,
          tags: d.memory.tags,
        })),
        llmFallbackFired: memResult.llmFallbackFired,
      });

      // ── Context assembly ──────────────────────────────────────────────────

      const speakerChar = characters.find((c) => c.id === activeSpeaker);
      const effectiveModel =
        speakerChar?.modelOverride || params.model || undefined;

      const currentLocation = chatState.currentLocationId
        ? locations.find((l) => l.id === chatState.currentLocationId)
        : undefined;
      const locationOverrides = chatState.currentLocationId
        ? chatState.locationOverrides[chatState.currentLocationId]
        : undefined;

      const settings = await getSettings();

      const otherCharMemoriesRegen = new Map<string, MemoryItem[]>();
      for (let i = 0; i < characters.length; i++) {
        const c = characters[i];
        if (c.id !== activeSpeaker && !c.isUserPersona) {
          otherCharMemoriesRegen.set(c.id, characterChains[i]);
        }
      }

      t = Date.now();
      emitPipeline(reply.raw, "context_assembly", "start");

      const messages = assembleContext({
        story,
        characters: effectiveCharacters,
        activeSpeaker,
        recentTurns: freshTurns,
        mode: chat.mode,
        moodTags: params.moodTags,
        responseLength: params.responseLength,
        feelText: params.feelText,
        globalNote: settings.globalNote,
        currentLocation,
        locationOverrides,
        locations,
        speakerMemories: relevantMemories,
        otherCharMemories: otherCharMemoriesRegen,
      });

      const systemPromptText = messages[0]?.content ?? "";
      emitPipeline(reply.raw, "context_assembly", "complete", t, {
        systemPromptLength: systemPromptText.length,
        injectedMemoryIds: relevantMemories.map((m) => m.id),
        activeSpeakerId: activeSpeaker,
        currentLocationId: chatState.currentLocationId,
        moodTagCount: (params.moodTags ?? []).length,
      });

      const resolvedModel = effectiveModel ?? (await activeModel());

      emitFrame(reply.raw, {
        contextSnapshot: {
          story: { id: story.id, title: story.title },
          activeSpeakerId: activeSpeaker,
          characters: characters.map((base, i) => {
            const eff = effectiveCharacters[i];
            return {
              id: base.id,
              name: base.name,
              role: base.role,
              isUserPersona: base.isUserPersona,
              isNarrator: base.isNarrator,
              basePersonality: base.public.personality,
              effectivePersonality: eff.public.personality,
              baseSpeechStyle: base.public.speechStyle ?? "",
              effectiveSpeechStyle: eff.public.speechStyle ?? "",
              baseTrueMotives: base.private.trueMotives ?? "",
              effectiveTrueMotives: eff.private.trueMotives ?? "",
              baseFears: base.private.fears,
              effectiveFears: eff.private.fears,
            };
          }),
          accessibleMemories: accessibleMemories.map((m) => ({
            id: m.id,
            summary: m.summary.slice(0, 100),
            tags: m.tags,
            importance: m.importance,
          })),
          injectedMemoryIds: relevantMemories.map((m) => m.id),
          memoryReasons: memResult.reasons,
          locations: locations.map((l) => ({
            id: l.id,
            name: l.name,
            isCurrent: l.id === chatState.currentLocationId,
          })),
          currentLocationId: chatState.currentLocationId,
          moodTags: params.moodTags ?? [],
          responseLength: params.responseLength ?? "medium",
          feelText: params.feelText ?? "",
          model: resolvedModel,
        },
      });

      emitFrame(reply.raw, {
        debug: { systemPrompt: systemPromptText, model: resolvedModel },
      });

      // ── LLM call ─────────────────────────────────────────────────────────

      t = Date.now();
      emitPipeline(reply.raw, "llm_call", "start");

      let fullText = "";
      try {
        fullText = await streamChat({
          messages,
          model: effectiveModel,
          temperature: params.temperature,
          top_p: params.top_p,
          top_k: params.top_k,
          repeat_penalty: params.repeat_penalty,
          onChunk: (chunk) => {
            reply.raw.write(JSON.stringify({ content: chunk }) + "\n");
          },
        });
      } catch (err) {
        emitPipeline(reply.raw, "llm_call", "error", t);
        const msg = err instanceof Error ? err.message : "Stream error";
        emitFrame(reply.raw, { error: msg });
        reply.raw.end();
        return;
      }

      emitPipeline(reply.raw, "llm_call", "complete", t, {
        model: resolvedModel,
        tokenCount: fullText.split(/\s+/).length,
        durationMs: Date.now() - t,
      });

      if (fullText) {
        await appendTurn({
          id: randomUUID(),
          chatId,
          speaker: activeSpeaker,
          role: "assistant",
          text: fullText,
          timestamp: new Date().toISOString(),
          pinned: false,
          meta: { mode: chat.mode },
        });
      }
      emitFrame(reply.raw, { done: true });
      reply.raw.end();
    },
  );

  // ─── Seed a prewritten opening turn ──────────────────────────────────────

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

  // ─── Generate opening turn (streaming) ───────────────────────────────────

  app.post<{ Params: { storyId: string; chatId: string } }>(
    "/stories/:storyId/chats/:chatId/opener",
    async (req, reply) => {
      const { storyId, chatId } = req.params;
      const [story, chat, characters, locations, chatState] = await Promise.all(
        [
          stories_store.get(storyId),
          chat_store.get(chatId),
          characters_store.list({ storyId }),
          locations_store.list({ storyId }),
          chat_state_store.get(chatId),
        ],
      );
      if (!story) return reply.status(404).send({ error: "Story not found" });
      if (!chat) return reply.status(404).send({ error: "Chat not found" });
      if (!chatState)
        return reply.status(404).send({ error: "Chat state not found" });

      const activeSpeaker = chat.activeSpeakers[0] ?? "narrator";
      const settings = await getSettings();

      const allowedOriginsOpener = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
      ];
      const reqOriginOpener = req.headers.origin ?? "";
      const corsOriginOpener = allowedOriginsOpener.includes(reqOriginOpener)
        ? reqOriginOpener
        : allowedOriginsOpener[0];
      reply.raw.writeHead(200, {
        "Content-Type": "application/x-ndjson",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": corsOriginOpener,
      });

      emitPipeline(reply.raw, "data_load", "complete", undefined, {
        characterCount: characters.length,
        locationCount: locations.length,
        turnCount: 0,
      });

      // ── Memory chain ──────────────────────────────────────────────────────

      let t = Date.now();
      emitPipeline(reply.raw, "memory_chain", "start");

      const characterChains = await resolveCharacterChains(
        characters,
        chat.memoryTimelineCutoff,
      );
      const effectiveCharacters = characters.map((c, i) => {
        const chain = characterChains[i];
        return chain.length > 0 ? applyMemoryChain(c, chain) : c;
      });

      emitPipeline(reply.raw, "memory_chain", "complete", t, {
        chains: buildChainDiffs(
          characters,
          effectiveCharacters,
          characterChains,
        ),
      });

      // ── Memory retrieval (opener uses full chain directly) ────────────────

      const openerActiveSpeakerIdx =
        activeSpeaker === "narrator"
          ? -1
          : characters.findIndex((c) => c.id === activeSpeaker);
      const openerSpeakerMemories =
        openerActiveSpeakerIdx >= 0
          ? characterChains[openerActiveSpeakerIdx]
          : [];

      const syntheticReasons: Record<string, MemoryReason> = {};
      for (const m of openerSpeakerMemories)
        syntheticReasons[m.id] = "always_include";

      emitPipeline(reply.raw, "memory_retrieval", "complete", undefined, {
        accessibleCount: openerSpeakerMemories.length,
        results: openerSpeakerMemories.map((m) => ({
          memoryId: m.id,
          summary: m.summary.slice(0, 100),
          reason: "always_include" as MemoryReason,
          tags: m.tags,
        })),
        llmFallbackFired: false,
      });

      // ── Context assembly ──────────────────────────────────────────────────

      const currentLocation = chatState.currentLocationId
        ? locations.find((l) => l.id === chatState.currentLocationId)
        : undefined;
      const locationOverrides = chatState.currentLocationId
        ? chatState.locationOverrides[chatState.currentLocationId]
        : undefined;

      const openerLength =
        chat.mode === "storyteller" ? "paragraph+" : "medium";

      const openerOtherCharMemories = new Map<string, MemoryItem[]>();
      for (let i = 0; i < characters.length; i++) {
        const c = characters[i];
        if (c.id !== activeSpeaker && !c.isUserPersona) {
          openerOtherCharMemories.set(c.id, characterChains[i]);
        }
      }

      t = Date.now();
      emitPipeline(reply.raw, "context_assembly", "start");

      const messages = assembleContext({
        story,
        characters: effectiveCharacters,
        activeSpeaker,
        recentTurns: [],
        mode: chat.mode,
        globalNote: settings.globalNote,
        currentLocation,
        locationOverrides,
        locations,
        responseLength: openerLength,
        moodTags: [],
        feelText: "",
        speakerMemories: openerSpeakerMemories,
        otherCharMemories: openerOtherCharMemories,
      });

      const systemPromptText = messages[0]?.content ?? "";
      emitPipeline(reply.raw, "context_assembly", "complete", t, {
        systemPromptLength: systemPromptText.length,
        injectedMemoryIds: openerSpeakerMemories.map((m) => m.id),
        activeSpeakerId: activeSpeaker,
        currentLocationId: chatState.currentLocationId,
        moodTagCount: 0,
      });

      const sortedMems = [...openerSpeakerMemories].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );
      const anchorMem = sortedMems[sortedMems.length - 1];
      const anchorLocName = anchorMem?.locationId
        ? locations.find((l) => l.id === anchorMem.locationId)?.name
        : undefined;
      const sceneLoc = currentLocation?.name ?? anchorLocName;

      let openerContent = "[Begin the story.";
      if (anchorMem?.summary)
        openerContent += ` Open directly in this moment: ${anchorMem.summary}.`;
      if (sceneLoc) openerContent += ` The scene is set at: ${sceneLoc}.`;
      openerContent +=
        " Ground yourself in this specific situation — no recap, no preamble.]";
      messages.push({ role: "user", content: openerContent });

      const speakerChar = characters.find((c) => c.id === activeSpeaker);
      const effectiveModel = speakerChar?.modelOverride || undefined;
      const resolvedModel = effectiveModel ?? (await activeModel());

      emitFrame(reply.raw, {
        contextSnapshot: {
          story: { id: story.id, title: story.title },
          activeSpeakerId: activeSpeaker,
          characters: characters.map((base, i) => {
            const eff = effectiveCharacters[i];
            return {
              id: base.id,
              name: base.name,
              role: base.role,
              isUserPersona: base.isUserPersona,
              isNarrator: base.isNarrator,
              basePersonality: base.public.personality,
              effectivePersonality: eff.public.personality,
              baseSpeechStyle: base.public.speechStyle ?? "",
              effectiveSpeechStyle: eff.public.speechStyle ?? "",
              baseTrueMotives: base.private.trueMotives ?? "",
              effectiveTrueMotives: eff.private.trueMotives ?? "",
              baseFears: base.private.fears,
              effectiveFears: eff.private.fears,
            };
          }),
          accessibleMemories: openerSpeakerMemories.map((m) => ({
            id: m.id,
            summary: m.summary.slice(0, 100),
            tags: m.tags,
            importance: m.importance,
          })),
          injectedMemoryIds: openerSpeakerMemories.map((m) => m.id),
          memoryReasons: syntheticReasons,
          locations: locations.map((l) => ({
            id: l.id,
            name: l.name,
            isCurrent: l.id === chatState.currentLocationId,
          })),
          currentLocationId: chatState.currentLocationId,
          moodTags: [],
          responseLength: openerLength,
          feelText: "",
          model: resolvedModel,
        },
      });

      emitFrame(reply.raw, {
        debug: { systemPrompt: systemPromptText, model: resolvedModel },
      });

      // ── LLM call ─────────────────────────────────────────────────────────

      t = Date.now();
      emitPipeline(reply.raw, "llm_call", "start");

      let fullText = "";
      try {
        fullText = await streamChat({
          messages,
          model: effectiveModel,
          onChunk: (chunk) => {
            reply.raw.write(JSON.stringify({ content: chunk }) + "\n");
          },
        });
      } catch (err) {
        emitPipeline(reply.raw, "llm_call", "error", t);
        emitFrame(reply.raw, {
          error: err instanceof Error ? err.message : "Stream error",
        });
        reply.raw.end();
        return;
      }

      emitPipeline(reply.raw, "llm_call", "complete", t, {
        model: resolvedModel,
        tokenCount: fullText.split(/\s+/).length,
        durationMs: Date.now() - t,
      });

      if (fullText) {
        await appendTurn({
          id: randomUUID(),
          chatId,
          speaker: activeSpeaker,
          role: "assistant",
          text: fullText,
          timestamp: new Date().toISOString(),
          pinned: false,
          meta: { mode: chat.mode },
        });
      }
      emitFrame(reply.raw, { done: true });
      reply.raw.end();
    },
  );

  // ─── Planning chat message (DM collaborator, streaming) ─────────────────

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
        return reply
          .status(400)
          .send({ error: "Chat is not a planning chat" });

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

      const allowedOrigins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
      ];
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

      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
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
            .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
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

  // ─── Turn management ──────────────────────────────────────────────────────

  app.patch<{ Params: { storyId: string; chatId: string; turnId: string } }>(
    "/stories/:storyId/chats/:chatId/turns/:turnId",
    async (req, reply) => {
      const { text } = req.body as { text?: string };
      if (!text) return reply.status(400).send({ error: "text is required" });
      const turn = await turn_store.update(req.params.turnId, { text });
      if (!turn) return reply.status(404).send({ error: "Turn not found" });
      return turn;
    },
  );

  app.delete<{ Params: { storyId: string; chatId: string; turnId: string } }>(
    "/stories/:storyId/chats/:chatId/turns/:turnId",
    async (req, reply) => {
      const ok = await deleteSingleTurn(
        req.params.storyId,
        req.params.chatId,
        req.params.turnId,
      );
      if (!ok) return reply.status(404).send({ error: "Turn not found" });
      return { ok: true };
    },
  );

  app.delete<{ Params: { storyId: string; chatId: string; turnId: string } }>(
    "/stories/:storyId/chats/:chatId/turns/:turnId/after",
    async (req, reply) => {
      const ok = await deleteAfterTurn(
        req.params.storyId,
        req.params.chatId,
        req.params.turnId,
      );
      if (!ok) return reply.status(404).send({ error: "Turn not found" });
      return { ok: true };
    },
  );

  // ─── Memory items ─────────────────────────────────────────────────────────

  app.get<{ Params: { storyId: string; chatId: string } }>(
    "/stories/:storyId/chats/:chatId/memory",
    async (req) => {
      return memories_store.list({ storyId: req.params.storyId });
    },
  );

  app.post<{ Params: { storyId: string; chatId: string } }>(
    "/stories/:storyId/chats/:chatId/memory",
    async (req, reply) => {
      const body = MemoryItemCreateSchema.safeParse(req.body);
      if (!body.success)
        return reply.status(400).send({ error: body.error.flatten() });
      const item = await memories_store.add({
        ...body.data,
        id: randomUUID(),
        createdAt: now(),
        updatedAt: now(),
        storyId: req.params.storyId,
      });
      return reply.status(201).send(item);
    },
  );
}

// ─── Private helpers ──────────────────────────────────────────────────────────

async function resolveCharacterChains(
  characters: import("@simplechat/types").Character[],
  memoryTimelineCutoff: string | undefined,
): Promise<import("@simplechat/types").MemoryItem[][]> {
  return Promise.all(
    characters.map((c) =>
      getMemoryChainForCharacter(c.id, memoryTimelineCutoff),
    ),
  );
}

function buildDmSystemPrompt(
  story: Story,
  characters: import("@simplechat/types").Character[],
  locations: import("@simplechat/types").Location[],
): string {
  const parts: string[] = [
    "You are a creative collaborator helping plan and develop a story. You are the author's thoughtful story architect and Dungeon Master.",
    "",
    `STORY: ${story.title}`,
  ];
  if (story.premise) parts.push(`PREMISE: ${story.premise}`);
  if (story.genres?.length)
    parts.push(`GENRE: ${story.genres.join(", ")}`);
  if (story.tone?.length)
    parts.push(`TONE: ${story.tone.join(", ")}`);
  if (story.rules?.length) {
    parts.push("WORLD RULES:");
    for (const rule of story.rules) parts.push(`- ${rule}`);
  }

  if (characters.length > 0) {
    parts.push("", "EXISTING CHARACTERS:");
    for (const c of characters) {
      const traits = c.public?.personality?.join(", ") ?? "";
      const appearance = c.public?.appearance ?? "";
      let line = `- ${c.name}`;
      if (c.role) line += ` (${c.role})`;
      if (appearance) line += `: ${appearance}`;
      if (traits) line += `. Traits: ${traits}`;
      parts.push(line);
    }
  }

  if (locations.length > 0) {
    parts.push("", "EXISTING LOCATIONS:");
    for (const l of locations) {
      let line = `- ${l.name}`;
      if (l.description) line += `: ${l.description}`;
      parts.push(line);
    }
  }

  parts.push(
    "",
    "YOUR ROLE:",
    "- Be a proactive creative partner — suggest what the story needs, don't just respond passively",
    "- When you propose a specific character, location, or backstory event, describe it with concrete details",
    "- Stay true to the established tone and world rules",
    "- Be concise but substantive; you are building this story together with the author",
    "- If the author agrees to add something, confirm and describe it fully so it can be saved",
  );

  return parts.join("\n");
}

async function generateLocationFromContext(
  name: string,
  story: Story,
  recentTurns: Turn[],
): Promise<LocationCreate> {
  const sceneText = recentTurns.map((t) => `${t.role}: ${t.text}`).join("\n");
  let raw = "";
  try {
    await streamChat({
      messages: [
        {
          role: "system",
          content: [
            "You are a setting designer. Return ONLY valid JSON describing a location.",
            'Return this shape: { "description": "", "atmosphere": "", "lighting": "", "soundscape": "", "smells": "", "layout": "", "notes": "", "tags": [] }',
            "Infer sensory details from the scene context. Be evocative but concise (1-2 sentences per field).",
          ].join("\n"),
        },
        {
          role: "user",
          content: `Story: ${story.premise ?? story.title}\nNew location name: ${name}\nRecent scene:\n${sceneText}`,
        },
      ],
      temperature: 0.3,
      onChunk: (chunk) => {
        raw += chunk;
      },
    });
    const data = extractJson(raw) as Record<string, unknown>;
    return {
      name,
      description: typeof data.description === "string" ? data.description : "",
      atmosphere: typeof data.atmosphere === "string" ? data.atmosphere : "",
      lighting: typeof data.lighting === "string" ? data.lighting : "",
      soundscape: typeof data.soundscape === "string" ? data.soundscape : "",
      smells: typeof data.smells === "string" ? data.smells : "",
      layout: typeof data.layout === "string" ? data.layout : "",
      notes: typeof data.notes === "string" ? data.notes : "",
      tags: Array.isArray(data.tags)
        ? (data.tags as string[]).filter((t) => typeof t === "string")
        : [],
    };
  } catch {
    return { name };
  }
}
