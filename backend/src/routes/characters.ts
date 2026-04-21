import type { FastifyInstance } from 'fastify'
import { CharacterCreateSchema, CharacterUpdateSchema } from '@simplechat/types'
import * as storage from '../storage.js'

function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  return JSON.parse((fenced ? fenced[1] : raw).trim())
}

export async function charactersRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>('/stories/:id/characters', async (req) => {
    return storage.listCharacters(req.params.id)
  })

  app.post<{ Params: { id: string } }>('/stories/:id/characters', async (req, reply) => {
    const body = CharacterCreateSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const char = await storage.createCharacter(req.params.id, body.data)
    return reply.status(201).send(char)
  })

  app.patch<{ Params: { id: string; cid: string } }>('/stories/:id/characters/:cid', async (req, reply) => {
    const body = CharacterUpdateSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const char = await storage.updateCharacter(req.params.id, req.params.cid, body.data)
    if (!char) return reply.status(404).send({ error: 'Character not found' })
    return char
  })

  app.delete<{ Params: { id: string; cid: string } }>('/stories/:id/characters/:cid', async (req, reply) => {
    const ok = await storage.deleteCharacter(req.params.id, req.params.cid)
    if (!ok) return reply.status(404).send({ error: 'Character not found' })
    return { ok: true }
  })

  // ─── AI Character Generation ──────────────────────────────────────────────

  app.post<{ Params: { id: string } }>('/stories/:id/characters/generate-fields', async (req, reply) => {
    const { prompt } = req.body as { prompt?: string }
    if (!prompt?.trim()) return reply.status(400).send({ error: 'prompt is required' })

    const story = await storage.getStory(req.params.id)
    const storyContext = story ? `Story: "${story.title}"${story.premise ? `\nPremise: ${story.premise}` : ''}` : ''

    const { streamChat } = await import('../ollama.js')
    const systemPrompt = [
      'You are a creative writing assistant. Return ONLY valid JSON — no explanation, no markdown, no code fences.',
      'Given a character description, generate a complete character profile.',
      'Return exactly this JSON shape:',
      '{',
      '  "name": "string",',
      '  "role": "string (title or occupation)",',
      '  "age": "string (e.g. \\"mid-30s\\" or \\"ancient\\")",',
      '  "gender": "string",',
      '  "species": "string (e.g. human, wolf, android — default human)",',
      '  "clothing": "string (brief outfit description)",',
      '  "appearance": "string (2-3 sentences of physical description)",',
      '  "personality": ["trait1", "trait2"],',
      '  "speechStyle": "string (one sentence)",',
      '  "trueMotives": "string (hidden goal, 1-2 sentences)",',
      '  "fears": ["fear1", "fear2"]',
      '}',
    ].join('\n')

    let raw = ''
    await streamChat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `${storyContext ? storyContext + '\n\n' : ''}Character description: ${prompt.trim()}` },
      ],
      temperature: 0.85,
      onChunk: (text) => { raw += text },
    })

    try {
      const data = extractJson(raw) as Record<string, unknown>
      return {
        name:        typeof data.name        === 'string' ? data.name        : '',
        role:        typeof data.role        === 'string' ? data.role        : '',
        age:         typeof data.age         === 'string' ? data.age         : '',
        gender:      typeof data.gender      === 'string' ? data.gender      : '',
        species:     typeof data.species     === 'string' ? data.species     : 'human',
        clothing:    typeof data.clothing    === 'string' ? data.clothing    : '',
        appearance:  typeof data.appearance  === 'string' ? data.appearance  : '',
        personality: Array.isArray(data.personality) ? data.personality.filter((x): x is string => typeof x === 'string') : [],
        speechStyle: typeof data.speechStyle === 'string' ? data.speechStyle : '',
        trueMotives: typeof data.trueMotives === 'string' ? data.trueMotives : '',
        fears:       Array.isArray(data.fears) ? data.fears.filter((x): x is string => typeof x === 'string') : [],
      }
    } catch {
      return reply.status(422).send({ error: 'LLM did not return valid JSON', raw })
    }
  })
}
