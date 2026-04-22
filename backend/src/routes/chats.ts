import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { ChatCreateSchema, ChatEntityStateSchema, SendMessageSchema, type Story, type Turn, type CharacterMemory, type LocationCreate } from '@simplechat/types'
import * as storage from '../storage.js'
import { streamChat, activeModel } from '../ollama.js'
import { assembleContext } from '../context.js'
import { getSettings } from '../config.js'
import { findRelevantMemories } from '../memory-retrieval.js'
import { runExtraction } from '../extraction.js'
import { applyMemoryChain } from '../character-state.js'
import { extractJson } from '../utils.js'

export async function chatsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { storyId: string } }>('/stories/:storyId/chats', async (req) => {
    return storage.listChats(req.params.storyId)
  })

  app.post<{ Params: { storyId: string } }>('/stories/:storyId/chats', async (req, reply) => {
    const body = ChatCreateSchema.safeParse({ ...req.body as object, storyId: req.params.storyId })
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const chat = await storage.createChat(body.data)
    if (body.data.startingLocationId) {
      await storage.updateChatState(req.params.storyId, chat.id, ChatEntityStateSchema.parse({
        chatId: chat.id,
        storyId: req.params.storyId,
        currentLocationId: body.data.startingLocationId,
        locationOverrides: {},
        updatedAt: new Date().toISOString(),
      }))
    }
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

      const allTurns = [...existingTurns, userTurn]

      // Apply memory chains to ALL characters scoped to the chat's timeline anchors
      const characterChains = await resolveCharacterChains(storyId, chatId, characters, chat.memoryTimelineCutoff)
      const effectiveCharacters = characters.map((c, i) => {
        const chain = characterChains[i]
        return chain.length > 0 ? applyMemoryChain(c, chain) : c
      })

      // Use the active speaker's chain for relevance retrieval
      const activeSpeakerIdx = characters.findIndex((c) => c.id === activeSpeaker)
      const accessibleMemories = activeSpeakerIdx >= 0 ? characterChains[activeSpeakerIdx] : []
      const relevantMemories = await findRelevantMemories(accessibleMemories, allTurns)

      // Resolve current location and its state overrides
      const currentLocation = chatState.currentLocationId
        ? locations.find((l) => l.id === chatState.currentLocationId)
        : undefined
      const locationOverrides = chatState.currentLocationId
        ? chatState.locationOverrides[chatState.currentLocationId]
        : undefined

      const otherCharMemories = new Map<string, CharacterMemory[]>()
      for (let i = 0; i < characters.length; i++) {
        const c = characters[i]
        if (c.id !== activeSpeaker && !c.isUserPersona) {
          otherCharMemories.set(c.id, characterChains[i])
        }
      }

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

        // Run entity extraction and emit state update frame
        if (locations.length > 0) {
          try {
            const completedTurns = [...allTurns, assistantTurn]
            const extracted = await runExtraction({
              recentTurns: completedTurns.slice(-6),
              story,
              locations,
              currentState: chatState,
            })

            let finalState = extracted
            let newLocationCreated = false

            if (extracted.newLocationName) {
              const newLocFields = await generateLocationFromContext(extracted.newLocationName, story, completedTurns.slice(-4))
              const newLoc = await storage.createLocation(storyId, newLocFields)
              locations.push(newLoc)
              finalState = { ...extracted, currentLocationId: newLoc.id, locationOverrides: {} }
              newLocationCreated = true
            }

            await storage.updateChatState(storyId, chatId, finalState)

            const locationChanged = finalState.currentLocationId !== chatState.currentLocationId
            const overridesChanged = JSON.stringify(finalState.locationOverrides) !== JSON.stringify(chatState.locationOverrides)
            if (locationChanged || overridesChanged || newLocationCreated) {
              const locationName = finalState.currentLocationId
                ? locations.find((l) => l.id === finalState.currentLocationId)?.name ?? null
                : null
              reply.raw.write(JSON.stringify({ stateUpdate: { currentLocationId: finalState.currentLocationId, locationName, newLocationCreated } }) + '\n')
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

      const characterChains = await resolveCharacterChains(storyId, chatId, characters, chat.memoryTimelineCutoff)
      const effectiveCharacters = characters.map((c, i) => {
        const chain = characterChains[i]
        return chain.length > 0 ? applyMemoryChain(c, chain) : c
      })

      const activeSpeakerIdx = characters.findIndex((c) => c.id === activeSpeaker)
      const accessibleMemories = activeSpeakerIdx >= 0 ? characterChains[activeSpeakerIdx] : []
      const relevantMemories = await findRelevantMemories(accessibleMemories, freshTurns)

      const currentLocation = chatState.currentLocationId
        ? locations.find((l) => l.id === chatState.currentLocationId)
        : undefined
      const locationOverrides = chatState.currentLocationId
        ? chatState.locationOverrides[chatState.currentLocationId]
        : undefined

      const settings = await getSettings()

      const otherCharMemoriesRegen = new Map<string, CharacterMemory[]>()
      for (let i = 0; i < characters.length; i++) {
        const c = characters[i]
        if (c.id !== activeSpeaker && !c.isUserPersona) {
          otherCharMemoriesRegen.set(c.id, characterChains[i])
        }
      }

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

      const characterChains = await resolveCharacterChains(storyId, chatId, characters, chat.memoryTimelineCutoff)
      const effectiveCharacters = characters.map((c, i) => {
        const chain = characterChains[i]
        return chain.length > 0 ? applyMemoryChain(c, chain) : c
      })

      const currentLocation = chatState.currentLocationId
        ? locations.find((l) => l.id === chatState.currentLocationId)
        : undefined
      const locationOverrides = chatState.currentLocationId
        ? chatState.locationOverrides[chatState.currentLocationId]
        : undefined

      const openerLength = chat.mode === 'storyteller' ? 'paragraph+' : 'medium'

      // For the opener, use the speaker's genesis/anchor chain as history
      const openerActiveSpeakerIdx = characters.findIndex((c) => c.id === activeSpeaker)
      const openerSpeakerMemories = openerActiveSpeakerIdx >= 0 ? characterChains[openerActiveSpeakerIdx] : []

      const openerOtherCharMemories = new Map<string, CharacterMemory[]>()
      for (let i = 0; i < characters.length; i++) {
        const c = characters[i]
        if (c.id !== activeSpeaker && !c.isUserPersona) {
          openerOtherCharMemories.set(c.id, characterChains[i])
        }
      }

      const messages = assembleContext({
        story, characters: effectiveCharacters, activeSpeaker,
        recentTurns: [],
        mode: chat.mode,
        globalNote: settings.globalNote,
        currentLocation,
        locationOverrides,
        locations,
        responseLength: openerLength,
        moodTags: [],
        feelText: '',
        speakerMemories: openerSpeakerMemories,
        otherCharMemories: openerOtherCharMemories,
      })
      const sortedMems = [...openerSpeakerMemories].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      const anchorMem = sortedMems[sortedMems.length - 1]
      const anchorLocName = anchorMem?.locationId
        ? locations.find((l) => l.id === anchorMem.locationId)?.name
        : undefined
      const sceneLoc = currentLocation?.name ?? anchorLocName

      let openerContent = '[Begin the story.'
      if (anchorMem?.summary) openerContent += ` Open directly in this moment: ${anchorMem.summary}.`
      if (sceneLoc) openerContent += ` The scene is set at: ${sceneLoc}.`
      openerContent += ' Ground yourself in this specific situation — no recap, no preamble.]'

      messages.push({ role: 'user', content: openerContent })

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

async function resolveCharacterChains(
  storyId: string,
  chatId: string,
  characters: import('@simplechat/types').Character[],
  memoryTimelineCutoff: string | undefined,
): Promise<import('@simplechat/types').CharacterMemory[][]> {
  return Promise.all(
    characters.map(async (c) => {
      const mems = await storage.listCharacterMemories(storyId, c.id)
      return resolveAccessibleMemories(mems, storyId, c.id, memoryTimelineCutoff, chatId)
    }),
  )
}

async function generateLocationFromContext(
  name: string,
  story: Story,
  recentTurns: Turn[],
): Promise<LocationCreate> {
  const sceneText = recentTurns.map((t) => `${t.role}: ${t.text}`).join('\n')
  let raw = ''
  try {
    await streamChat({
      messages: [
        {
          role: 'system',
          content: [
            'You are a setting designer. Return ONLY valid JSON describing a location.',
            'Return this shape: { "description": "", "atmosphere": "", "lighting": "", "soundscape": "", "smells": "", "layout": "", "notes": "", "tags": [] }',
            'Infer sensory details from the scene context. Be evocative but concise (1-2 sentences per field).',
          ].join('\n'),
        },
        {
          role: 'user',
          content: `Story: ${story.premise ?? story.title}\nNew location name: ${name}\nRecent scene:\n${sceneText}`,
        },
      ],
      temperature: 0.3,
      onChunk: (chunk) => { raw += chunk },
    })
    const data = extractJson(raw) as Record<string, unknown>
    return {
      name,
      description: typeof data.description === 'string' ? data.description : '',
      atmosphere: typeof data.atmosphere === 'string' ? data.atmosphere : '',
      lighting: typeof data.lighting === 'string' ? data.lighting : '',
      soundscape: typeof data.soundscape === 'string' ? data.soundscape : '',
      smells: typeof data.smells === 'string' ? data.smells : '',
      layout: typeof data.layout === 'string' ? data.layout : '',
      notes: typeof data.notes === 'string' ? data.notes : '',
      tags: Array.isArray(data.tags) ? (data.tags as string[]).filter((t) => typeof t === 'string') : [],
    }
  } catch {
    return { name }
  }
}

async function resolveAccessibleMemories(
  allMemories: CharacterMemory[],
  storyId: string,
  charId: string | undefined,
  memoryTimelineCutoff: string | undefined,
  chatId: string,
): Promise<CharacterMemory[]> {
  if (!charId || allMemories.length === 0) return []

  let chain: CharacterMemory[]

  if (memoryTimelineCutoff) {
    const eligible = allMemories.filter((m) => m.createdAt <= memoryTimelineCutoff)
    if (eligible.length === 0) return []
    const latest = eligible.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    chain = await storage.getMemoryChain(storyId, charId, latest.id)
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
