import type { FastifyInstance } from 'fastify'
import {
  StoryCreateSchema,
  StoryUpdateSchema,
  CharacterCreateSchema,
  CharacterUpdateSchema,
} from '@simplechat/types'
import * as storage from '../storage.js'

function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  return JSON.parse((fenced ? fenced[1] : raw).trim())
}

const STORY_GENRES = ['Fantasy', 'Sci-Fi', 'Horror', 'Romance', 'Mystery', 'Thriller', 'Historical', 'Contemporary']
const STORY_TONES  = ['Dark', 'Light', 'Grim', 'Hopeful', 'Intimate', 'Epic', 'Tense', 'Whimsical', 'Melancholic', 'Romantic']

export async function storiesRoutes(app: FastifyInstance): Promise<void> {

  // ─── AI Story Field Generation ──────────────────────────────────────────────

  app.post('/stories/generate-fields', async (req, reply) => {
    const { concept, includeTitle } = req.body as { concept?: string; includeTitle?: boolean }
    if (!concept?.trim()) return reply.status(400).send({ error: 'concept is required' })

    const { streamChat } = await import('../ollama.js')
    const titleField = includeTitle ? '\n  "title": "string",' : ''
    const systemPrompt = [
      'You are a creative writing assistant. Return ONLY valid JSON — no explanation, no markdown, no code fences.',
      'Given a story concept, extract characters and generate supporting configuration.',
      `Return exactly this JSON shape:{${titleField}`,
      '  "genres": ["string", ...],',
      `  // allowed genres: ${STORY_GENRES.join(', ')}`,
      '  "tone": ["string", ...],',
      `  // allowed tones: ${STORY_TONES.join(', ')}`,
      '  "rules": ["string", ...],',
      '  // 2-4 world rules as short sentences',
      '  "writingStyle": "string",',
      '  // one sentence describing narrative style',
      '  "characters": [',
      '    {',
      '      "name": "string",',
      '      "role": "string",',
      '      "isUserPersona": false,',
      '      // set isUserPersona: true only if this is explicitly the player/user character',
      '      "age": "string",',
      '      "gender": "string",',
      '      "species": "string",',
      '      "clothing": "string",',
      '      "appearance": "string",',
      '      "personality": ["trait"],',
      '      "speechStyle": "string",',
      '      "trueMotives": "string",',
      '      "fears": ["fear"]',
      '    }',
      '  ]',
      '  // extract named characters from the concept; create 1-3 if none are named',
      '}',
    ].join('\n')

    let raw = ''
    await streamChat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Story concept:\n${concept.trim()}` },
      ],
      temperature: 0.85,
      onChunk: (text) => { raw += text },
    })

    try {
      const data = extractJson(raw) as Record<string, unknown>
      const rawChars = Array.isArray(data.characters) ? data.characters : []
      const characters = rawChars
        .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
        .map((c) => ({
          name:        typeof c.name        === 'string' ? c.name        : '',
          role:        typeof c.role        === 'string' ? c.role        : '',
          isUserPersona: c.isUserPersona === true,
          age:         typeof c.age         === 'string' ? c.age         : '',
          gender:      typeof c.gender      === 'string' ? c.gender      : '',
          species:     typeof c.species     === 'string' ? c.species     : 'human',
          clothing:    typeof c.clothing    === 'string' ? c.clothing    : '',
          appearance:  typeof c.appearance  === 'string' ? c.appearance  : '',
          personality: Array.isArray(c.personality) ? c.personality.filter((x): x is string => typeof x === 'string') : [],
          speechStyle: typeof c.speechStyle === 'string' ? c.speechStyle : '',
          trueMotives: typeof c.trueMotives === 'string' ? c.trueMotives : '',
          fears:       Array.isArray(c.fears) ? c.fears.filter((x): x is string => typeof x === 'string') : [],
        }))
        .filter((c) => c.name)
      return {
        ...(includeTitle && typeof data.title === 'string' ? { title: data.title } : {}),
        genres:       Array.isArray(data.genres)       ? data.genres.filter((x): x is string => typeof x === 'string')       : [],
        tone:         Array.isArray(data.tone)         ? data.tone.filter((x): x is string => typeof x === 'string')         : [],
        rules:        Array.isArray(data.rules)        ? data.rules.filter((x): x is string => typeof x === 'string')        : [],
        writingStyle: typeof data.writingStyle === 'string' ? data.writingStyle : '',
        characters,
      }
    } catch {
      return reply.status(422).send({ error: 'LLM did not return valid JSON', raw })
    }
  })

  app.post<{ Params: { id: string } }>('/stories/:id/generate-supporting', async (req, reply) => {
    const story = await storage.getStory(req.params.id)
    if (!story) return reply.status(404).send({ error: 'Story not found' })
    if (!story.premise?.trim()) return reply.status(400).send({ error: 'Story has no premise to generate from' })

    const { streamChat } = await import('../ollama.js')
    const systemPrompt = [
      'You are a creative writing assistant. Return ONLY valid JSON — no explanation, no markdown, no code fences.',
      'Given a story premise, regenerate the supporting metadata fields.',
      'Return exactly this JSON shape:',
      '{',
      '  "genres": ["string", ...],',
      `  // allowed genres: ${STORY_GENRES.join(', ')}`,
      '  "tone": ["string", ...],',
      `  // allowed tones: ${STORY_TONES.join(', ')}`,
      '  "rules": ["string", ...],',
      '  "writingStyle": "string"',
      '}',
    ].join('\n')

    let raw = ''
    await streamChat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Story: "${story.title}"\n\nPremise:\n${story.premise.trim()}` },
      ],
      temperature: 0.85,
      onChunk: (text) => { raw += text },
    })

    try {
      const data = extractJson(raw) as Record<string, unknown>
      return {
        genres:       Array.isArray(data.genres)       ? data.genres.filter((x): x is string => typeof x === 'string')       : [],
        tone:         Array.isArray(data.tone)         ? data.tone.filter((x): x is string => typeof x === 'string')         : [],
        rules:        Array.isArray(data.rules)        ? data.rules.filter((x): x is string => typeof x === 'string')        : [],
        writingStyle: typeof data.writingStyle === 'string' ? data.writingStyle : '',
      }
    } catch {
      return reply.status(422).send({ error: 'LLM did not return valid JSON', raw })
    }
  })

  // ─── Stories ──────────────────────────────────────────────────────────────

  app.get('/stories', async () => {
    return storage.listStories()
  })

  app.get<{ Params: { id: string } }>('/stories/:id', async (req, reply) => {
    const story = await storage.getStory(req.params.id)
    if (!story) return reply.status(404).send({ error: 'Story not found' })
    const characters = await storage.listCharacters(req.params.id)
    return { story, characters }
  })

  app.post('/stories', async (req, reply) => {
    const body = StoryCreateSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const story = await storage.createStory(body.data)
    return reply.status(201).send(story)
  })

  app.patch<{ Params: { id: string } }>('/stories/:id', async (req, reply) => {
    const body = StoryUpdateSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const story = await storage.updateStory(req.params.id, body.data)
    if (!story) return reply.status(404).send({ error: 'Story not found' })
    return story
  })

  app.delete<{ Params: { id: string } }>('/stories/:id', async (req, reply) => {
    const ok = await storage.deleteStory(req.params.id)
    if (!ok) return reply.status(404).send({ error: 'Story not found' })
    return { ok: true }
  })

  // ─── Characters ───────────────────────────────────────────────────────────

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

  // ─── AI Single-Field Autofill (legacy) ───────────────────────────────────

  app.post<{ Params: { id: string } }>('/stories/:id/autofill', async (req, reply) => {
    const { field, context } = req.body as { field: string; context: string }
    if (!field) return reply.status(400).send({ error: 'field is required' })

    const { streamChat } = await import('../ollama.js')
    const prompt = `You are a creative writing assistant. Based on the following context, generate content for the "${field}" field of a roleplay story. Return only the generated content, no explanation.\n\nContext:\n${context ?? ''}\n\nGenerate ${field}:`

    let result = ''
    await streamChat({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
      onChunk: (text) => { result += text },
    })
    return { field, result: result.trim() }
  })
}
