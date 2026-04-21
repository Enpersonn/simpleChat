import type { FastifyInstance } from 'fastify'
import { LocationCreateSchema, LocationUpdateSchema } from '@simplechat/types'
import * as storage from '../storage.js'

function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  return JSON.parse((fenced ? fenced[1] : raw).trim())
}

export async function locationsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>('/stories/:id/locations', async (req) => {
    return storage.listLocations(req.params.id)
  })

  app.post<{ Params: { id: string } }>('/stories/:id/locations', async (req, reply) => {
    const body = LocationCreateSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const location = await storage.createLocation(req.params.id, body.data)
    return reply.status(201).send(location)
  })

  app.patch<{ Params: { id: string; lid: string } }>('/stories/:id/locations/:lid', async (req, reply) => {
    const body = LocationUpdateSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const location = await storage.updateLocation(req.params.id, req.params.lid, body.data)
    if (!location) return reply.status(404).send({ error: 'Location not found' })
    return location
  })

  app.delete<{ Params: { id: string; lid: string } }>('/stories/:id/locations/:lid', async (req, reply) => {
    const ok = await storage.deleteLocation(req.params.id, req.params.lid)
    if (!ok) return reply.status(404).send({ error: 'Location not found' })
    return { ok: true }
  })

  // ─── AI Location Generation ───────────────────────────────────────────────

  app.post<{ Params: { id: string } }>('/stories/:id/locations/generate-fields', async (req, reply) => {
    const { prompt } = req.body as { prompt?: string }
    if (!prompt?.trim()) return reply.status(400).send({ error: 'prompt is required' })

    const story = await storage.getStory(req.params.id)
    const storyContext = story ? `Story: "${story.title}"${story.premise ? `\nPremise: ${story.premise}` : ''}` : ''

    const { streamChat } = await import('../ollama.js')
    const systemPrompt = [
      'You are a creative writing assistant. Return ONLY valid JSON — no explanation, no markdown, no code fences.',
      'Given a location description, generate a complete location profile for a roleplay story.',
      'Return exactly this JSON shape:',
      '{',
      '  "name": "string",',
      '  "description": "string (1-2 sentences overview)",',
      '  "layout": "string (spatial description: size, shape, exits, notable features)",',
      '  "lighting": "string (quality and source of light)",',
      '  "atmosphere": "string (mood, feel, emotional tone)",',
      '  "soundscape": "string (ambient sounds)",',
      '  "smells": "string (scents, odors)",',
      '  "notes": "string (consistency rules for authors, e.g. always cold, low ceilings)",',
      '  "tags": ["tag1", "tag2"]',
      '}',
    ].join('\n')

    let raw = ''
    await streamChat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `${storyContext ? storyContext + '\n\n' : ''}Location description: ${prompt.trim()}` },
      ],
      temperature: 0.85,
      onChunk: (text) => { raw += text },
    })

    try {
      const data = extractJson(raw) as Record<string, unknown>
      return {
        name:        typeof data.name        === 'string' ? data.name        : '',
        description: typeof data.description === 'string' ? data.description : '',
        layout:      typeof data.layout      === 'string' ? data.layout      : '',
        lighting:    typeof data.lighting    === 'string' ? data.lighting    : '',
        atmosphere:  typeof data.atmosphere  === 'string' ? data.atmosphere  : '',
        soundscape:  typeof data.soundscape  === 'string' ? data.soundscape  : '',
        smells:      typeof data.smells      === 'string' ? data.smells      : '',
        notes:       typeof data.notes       === 'string' ? data.notes       : '',
        tags:        Array.isArray(data.tags) ? data.tags.filter((x): x is string => typeof x === 'string') : [],
      }
    } catch {
      return reply.status(422).send({ error: 'LLM did not return valid JSON', raw })
    }
  })
}
