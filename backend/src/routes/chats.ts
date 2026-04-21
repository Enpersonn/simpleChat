import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { ChatCreateSchema, SendMessageSchema, type Turn, type CharacterMemory } from '@simplechat/types'
import * as storage from '../storage.js'
import { streamChat, activeModel } from '../ollama.js'
import { assembleContext } from '../context.js'
import { getSettings } from '../config.js'
import { findRelevantMemories } from '../memory-retrieval.js'
import { runExtraction } from '../extraction.js'
import { applyMemoryChain } from '../character-state.js'

export async function chatsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { storyId: string } }>('/stories/:storyId/chats', async (req) => {
    return storage.listChats(req.params.storyId)
  })

  app.post<{ Params: { storyId: string } }>('/stories/:storyId/chats', async (req, reply) => {
    const body = ChatCreateSchema.safeParse({ ...req.body as object, storyId: req.params.storyId })
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const chat = await storage.createChat(body.data)
    return reply.status(201).send(chat)
  })

  app.get<{ Params: { storyId: string; chatId: string } }>(
    '/stories/:storyId/chats/:chatId',
    async (req, reply) => {
      const chat = await storage.getChat(req.params.storyId, req.params.chatId)
      if (!chat) return reply.status(404).send({ error: 'Chat not found' })
      return chat
    },
  )

  app.get<{ Params: { storyId: string; chatId: string } }>(
    '/stories/:storyId/chats/:chatId/history',
    async (req, reply) => {
      const chat = await storage.getChat(req.params.storyId, req.params.chatId)
      if (!chat) return reply.status(404).send({ error: 'Chat not found' })
      const turns = await storage.getTurns(req.params.storyId, req.params.chatId)
      return turns
    },
  )

  // ─── Chat entity state ────────────────────────────────────────────────────

  app.get<{ Params: { storyId: string; chatId: string } }>(
    '/stories/:storyId/chats/:chatId/state',
    async (req, reply) => {
      const chat = await storage.getChat(req.params.storyId, req.params.chatId)
      if (!chat) return reply.status(404).send({ error: 'Chat not found' })
      return storage.getChatState(req.params.storyId, req.params.chatId)
    },
  )

  app.patch<{ Params: { storyId: string; chatId: string } }>(
    '/stories/:storyId/chats/:chatId/state',
    async (req, reply) => {
      const chat = await storage.getChat(req.params.storyId, req.params.chatId)
      if (!chat) return reply.status(404).send({ error: 'Chat not found' })
      const updated = await storage.updateChatState(req.params.storyId, req.params.chatId, req.body as never)
      return updated
    },
  )

  // ─── Send message (streaming) ─────────────────────────────────────────────

  app.post<{ Params: { storyId: string; chatId: string } }>(
    '/stories/:storyId/chats/:chatId/message',
    async (req, reply) => {
      const { storyId, chatId } = req.params
      const body = SendMessageSchema.safeParse(req.body)
      if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

      const [story, chat, characters, existingTurns, locations, chatState] = await Promise.all([
        storage.getStory(storyId),
        storage.getChat(storyId, chatId),
        storage.listCharacters(storyId),
        storage.getTurns(storyId, chatId),
        storage.listLocations(storyId),
        storage.getChatState(storyId, chatId),
      ])

      if (!story) return reply.status(404).send({ error: 'Story not found' })
      if (!chat) return reply.status(404).send({ error: 'Chat not found' })

      const { text, speaker, moodTags, responseLength, feelText, temperature, top_p, top_k, repeat_penalty, model } = body.data

      const userTurn: Turn = {
        id: randomUUID(),
        chatId,
        speaker,
        role: 'user',
        text,
        timestamp: new Date().toISOString(),
        pinned: false,
        meta: { mode: chat.mode },
      }
      await storage.appendTurn(storyId, userTurn)

      const activeSpeaker = chat.activeSpeakers[0] ?? 'narrator'
      const speakerChar = characters.find((c) => c.id === activeSpeaker)
      const effectiveModel = speakerChar?.modelOverride || model || undefined
      const settings = await getSettings()

      // Build accessible memory chain for the active speaker
      const allMemories = speakerChar
        ? await storage.listCharacterMemories(storyId, speakerChar.id)
        : []
      const accessibleMemories = await resolveAccessibleMemories(
        allMemories, storyId, speakerChar?.id, chat.memoryAnchors, chatId,
      )
      const allTurns = [...existingTurns, userTurn]
      const relevantMemories = await findRelevantMemories(accessibleMemories, allTurns)

      // Effective character state: base + accumulated memory deltas
      const effectiveCharacters = characters.map((c) => {
        if (c.id !== activeSpeaker || accessibleMemories.length === 0) return c
        return applyMemoryChain(c, accessibleMemories)
      })

      // Resolve current location and its state overrides
      const currentLocation = chatState.currentLocationId
        ? locations.find((l) => l.id === chatState.currentLocationId)
        : undefined
      const locationOverrides = chatState.currentLocationId
        ? chatState.locationOverrides[chatState.currentLocationId]
        : undefined

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
        relevantMemories,
      })

      reply.raw.writeHead(200, {
        'Content-Type': 'application/x-ndjson',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
      })

      const resolvedModel = effectiveModel ?? await activeModel()
      reply.raw.write(JSON.stringify({ debug: { systemPrompt: messages[0]?.content ?? '', model: resolvedModel } }) + '\n')

      let fullText = ''
      try {
        fullText = await streamChat({
          messages,
          model: effectiveModel,
          temperature,
          top_p,
          top_k,
          repeat_penalty,
          onChunk: (chunk) => {
            reply.raw.write(JSON.stringify({ content: chunk }) + '\n')
          },
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Stream error'
        reply.raw.write(JSON.stringify({ error: msg }) + '\n')
      }

      // Persist assistant turn
      if (fullText) {
        const assistantTurn: Turn = {
          id: randomUUID(),
          chatId,
          speaker: activeSpeaker,
          role: 'assistant',
          text: fullText,
          timestamp: new Date().toISOString(),
          pinned: false,
          meta: { mode: chat.mode },
        }
        await storage.appendTurn(storyId, assistantTurn)

        // Run entity extraction in background and emit state update frame
        if (locations.length > 0) {
          try {
            const completedTurns = [...allTurns, assistantTurn]
            const newState = await runExtraction({
              recentTurns: completedTurns.slice(-6),
              story,
              locations,
              currentState: chatState,
            })
            await storage.updateChatState(storyId, chatId, newState)
            if (newState.currentLocationId !== chatState.currentLocationId || JSON.stringify(newState.locationOverrides) !== JSON.stringify(chatState.locationOverrides)) {
              const locationName = newState.currentLocationId
                ? locations.find((l) => l.id === newState.currentLocationId)?.name
                : null
              reply.raw.write(JSON.stringify({ stateUpdate: { currentLocationId: newState.currentLocationId, locationName } }) + '\n')
            }
          } catch {
            // Extraction failure is non-fatal
          }
        }
      }

      reply.raw.write(JSON.stringify({ done: true }) + '\n')
      reply.raw.end()
    },
  )

  // ─── Regenerate last assistant turn ───────────────────────────────────────

  app.post<{ Params: { storyId: string; chatId: string } }>(
    '/stories/:storyId/chats/:chatId/regenerate',
    async (req, reply) => {
      const { storyId, chatId } = req.params
      const body = SendMessageSchema.partial().safeParse(req.body ?? {})
      const params = body.success ? body.data : {}

      const [story, chat, characters, locations, chatState] = await Promise.all([
        storage.getStory(storyId),
        storage.getChat(storyId, chatId),
        storage.listCharacters(storyId),
        storage.listLocations(storyId),
        storage.getChatState(storyId, chatId),
      ])
      if (!story) return reply.status(404).send({ error: 'Story not found' })
      if (!chat) return reply.status(404).send({ error: 'Chat not found' })

      const turns = await storage.getTurns(storyId, chatId)
      const lastAssistant = [...turns].reverse().find((t) => t.role === 'assistant')
      if (lastAssistant) await storage.deleteSingleTurn(storyId, chatId, lastAssistant.id)

      const freshTurns = await storage.getTurns(storyId, chatId)
      const activeSpeaker = chat.activeSpeakers[0] ?? 'narrator'
      const speakerChar = characters.find((c) => c.id === activeSpeaker)
      const effectiveModel = speakerChar?.modelOverride || params.model || undefined

      const allMemories = speakerChar
        ? await storage.listCharacterMemories(storyId, speakerChar.id)
        : []
      const accessibleMemories = await resolveAccessibleMemories(
        allMemories, storyId, speakerChar?.id, chat.memoryAnchors, chatId,
      )
      const relevantMemories = await findRelevantMemories(accessibleMemories, freshTurns)

      const effectiveCharacters = characters.map((c) => {
        if (c.id !== activeSpeaker || accessibleMemories.length === 0) return c
        return applyMemoryChain(c, accessibleMemories)
      })

      const currentLocation = chatState.currentLocationId
        ? locations.find((l) => l.id === chatState.currentLocationId)
        : undefined
      const locationOverrides = chatState.currentLocationId
        ? chatState.locationOverrides[chatState.currentLocationId]
        : undefined

      const settings = await getSettings()
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
        relevantMemories,
      })

      reply.raw.writeHead(200, {
        'Content-Type': 'application/x-ndjson',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
      })

      const resolvedModel = effectiveModel ?? await activeModel()
      reply.raw.write(JSON.stringify({ debug: { systemPrompt: messages[0]?.content ?? '', model: resolvedModel } }) + '\n')

      let fullText = ''
      try {
        fullText = await streamChat({
          messages,
          model: effectiveModel,
          temperature: params.temperature,
          top_p: params.top_p,
          top_k: params.top_k,
          repeat_penalty: params.repeat_penalty,
          onChunk: (chunk) => {
            reply.raw.write(JSON.stringify({ content: chunk }) + '\n')
          },
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Stream error'
        reply.raw.write(JSON.stringify({ error: msg }) + '\n')
      }

      reply.raw.write(JSON.stringify({ done: true }) + '\n')
      reply.raw.end()

      if (fullText) {
        await storage.appendTurn(storyId, {
          id: randomUUID(),
          chatId,
          speaker: activeSpeaker,
          role: 'assistant',
          text: fullText,
          timestamp: new Date().toISOString(),
          pinned: false,
          meta: { mode: chat.mode },
        })
      }
    },
  )

  // ─── Seed a prewritten opening turn ──────────────────────────────────────

  app.post<{ Params: { storyId: string; chatId: string } }>(
    '/stories/:storyId/chats/:chatId/seed',
    async (req, reply) => {
      const { storyId, chatId } = req.params
      const { text } = req.body as { text?: string }
      if (!text?.trim()) return reply.status(400).send({ error: 'text is required' })
      const chat = await storage.getChat(storyId, chatId)
      if (!chat) return reply.status(404).send({ error: 'Chat not found' })
      const turn: Turn = {
        id: randomUUID(),
        chatId,
        speaker: chat.activeSpeakers[0] ?? 'narrator',
        role: 'assistant',
        text: text.trim(),
        timestamp: new Date().toISOString(),
        pinned: false,
        meta: { mode: chat.mode },
      }
      await storage.appendTurn(storyId, turn)
      return reply.status(201).send(turn)
    },
  )

  // ─── Generate opening turn (streaming) ───────────────────────────────────

  app.post<{ Params: { storyId: string; chatId: string } }>(
    '/stories/:storyId/chats/:chatId/opener',
    async (req, reply) => {
      const { storyId, chatId } = req.params
      const [story, chat, characters, locations, chatState] = await Promise.all([
        storage.getStory(storyId),
        storage.getChat(storyId, chatId),
        storage.listCharacters(storyId),
        storage.listLocations(storyId),
        storage.getChatState(storyId, chatId),
      ])
      if (!story) return reply.status(404).send({ error: 'Story not found' })
      if (!chat) return reply.status(404).send({ error: 'Chat not found' })

      const activeSpeaker = chat.activeSpeakers[0] ?? 'narrator'
      const settings = await getSettings()

      const currentLocation = chatState.currentLocationId
        ? locations.find((l) => l.id === chatState.currentLocationId)
        : undefined
      const locationOverrides = chatState.currentLocationId
        ? chatState.locationOverrides[chatState.currentLocationId]
        : undefined

      const messages = assembleContext({
        story, characters, activeSpeaker,
        recentTurns: [],
        mode: chat.mode,
        globalNote: settings.globalNote,
        currentLocation,
        locationOverrides,
      })
      messages.push({ role: 'user', content: '[Begin. Write the opening scene or greeting.]' })

      reply.raw.writeHead(200, {
        'Content-Type': 'application/x-ndjson',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
      })

      const speakerChar = characters.find((c) => c.id === activeSpeaker)
      const effectiveModel = speakerChar?.modelOverride || undefined
      const resolvedModel = effectiveModel ?? await activeModel()
      reply.raw.write(JSON.stringify({ debug: { systemPrompt: messages[0]?.content ?? '', model: resolvedModel } }) + '\n')

      let fullText = ''
      try {
        fullText = await streamChat({
          messages,
          model: effectiveModel,
          onChunk: (chunk) => { reply.raw.write(JSON.stringify({ content: chunk }) + '\n') },
        })
      } catch (err) {
        reply.raw.write(JSON.stringify({ error: err instanceof Error ? err.message : 'Stream error' }) + '\n')
      }

      reply.raw.write(JSON.stringify({ done: true }) + '\n')
      reply.raw.end()

      if (fullText) {
        await storage.appendTurn(storyId, {
          id: randomUUID(), chatId, speaker: activeSpeaker, role: 'assistant',
          text: fullText, timestamp: new Date().toISOString(), pinned: false,
          meta: { mode: chat.mode },
        })
      }
    },
  )

  // ─── Turn management ──────────────────────────────────────────────────────

  app.patch<{ Params: { storyId: string; chatId: string; turnId: string } }>(
    '/stories/:storyId/chats/:chatId/turns/:turnId',
    async (req, reply) => {
      const { text } = req.body as { text?: string }
      if (!text) return reply.status(400).send({ error: 'text is required' })
      const turn = await storage.updateTurn(req.params.storyId, req.params.chatId, req.params.turnId, text)
      if (!turn) return reply.status(404).send({ error: 'Turn not found' })
      return turn
    },
  )

  app.delete<{ Params: { storyId: string; chatId: string; turnId: string } }>(
    '/stories/:storyId/chats/:chatId/turns/:turnId',
    async (req, reply) => {
      const ok = await storage.deleteSingleTurn(req.params.storyId, req.params.chatId, req.params.turnId)
      if (!ok) return reply.status(404).send({ error: 'Turn not found' })
      return { ok: true }
    },
  )

  app.delete<{ Params: { storyId: string; chatId: string; turnId: string } }>(
    '/stories/:storyId/chats/:chatId/turns/:turnId/after',
    async (req, reply) => {
      const ok = await storage.deleteAfterTurn(req.params.storyId, req.params.chatId, req.params.turnId)
      if (!ok) return reply.status(404).send({ error: 'Turn not found' })
      return { ok: true }
    },
  )

  // ─── Memory items ─────────────────────────────────────────────────────────

  app.get<{ Params: { storyId: string; chatId: string } }>(
    '/stories/:storyId/chats/:chatId/memory',
    async (req) => {
      return storage.listMemoryItems(req.params.storyId, req.params.chatId)
    },
  )

  app.post<{ Params: { storyId: string; chatId: string } }>(
    '/stories/:storyId/chats/:chatId/memory',
    async (req, reply) => {
      const item = await storage.addMemoryItem(req.params.storyId, req.params.chatId, req.body as never)
      return reply.status(201).send(item)
    },
  )
}

async function resolveAccessibleMemories(
  allMemories: CharacterMemory[],
  storyId: string,
  charId: string | undefined,
  memoryAnchors: Record<string, string>,
  chatId: string,
): Promise<CharacterMemory[]> {
  if (!charId || allMemories.length === 0) return []

  const anchor = memoryAnchors[charId] ?? null
  let chain: CharacterMemory[]

  if (anchor) {
    chain = await storage.getMemoryChain(storyId, charId, anchor)
  } else {
    const heads = await storage.getMemoryHeads(storyId, charId)
    const head = heads.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    chain = head ? await storage.getMemoryChain(storyId, charId, head.id) : []
  }

  // Also include any memories created in this chat that aren't in the chain
  const chainIds = new Set(chain.map((m) => m.id))
  for (const m of allMemories) {
    if (m.sourceChatId === chatId && !chainIds.has(m.id)) {
      chain.push(m)
    }
  }

  return chain
}
