import type { Turn, Story, Location, ChatEntityState, LocationOverride } from '@simplechat/types'
import { streamChat } from './ollama.js'

export interface ExtractionContext {
  recentTurns: Turn[]
  story: Story
  locations: Location[]
  currentState: ChatEntityState
}

interface ExtractionResult {
  currentLocationId?: string | null
  locationOverrides?: Record<string, LocationOverride>
}

interface EntityExtractor {
  type: string
  extract(ctx: ExtractionContext): Promise<Partial<ExtractionResult>>
}

// ─── Location extractor ───────────────────────────────────────────────────────

const locationExtractor: EntityExtractor = {
  type: 'location',
  async extract(ctx) {
    if (ctx.locations.length === 0) return {}

    const recentText = ctx.recentTurns
      .slice(-4)
      .map((t) => `${t.role}: ${t.text}`)
      .join('\n')

    const locationList = ctx.locations
      .map((l) => `{"id":"${l.id}","name":${JSON.stringify(l.name)}}`)
      .join(', ')

    const currentId = ctx.currentState.currentLocationId

    let raw = ''
    try {
      await streamChat({
        messages: [
          {
            role: 'system',
            content: [
              'You are a scene-state tracker. Return ONLY valid JSON.',
              'Analyze the messages and detect scene changes.',
              'Return this shape:',
              '{',
              '  "currentLocationId": "<id from list, null if no location, or \\"unchanged\\" if same as before>",',
              '  "stateChanges": { "<field>": "<new value>" }',
              '  // stateChanges applies to the current location. Fields: lighting, atmosphere, soundscape, smells, description',
              '  // Only include fields that explicitly changed in the messages.',
              '}',
            ].join('\n'),
          },
          {
            role: 'user',
            content: [
              `Available locations: [${locationList}]`,
              `Current location id: ${currentId ?? 'none'}`,
              `\nRecent messages:\n${recentText}`,
            ].join('\n'),
          },
        ],
        temperature: 0.1,
        onChunk: (chunk) => { raw += chunk },
      })

      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
      const data = JSON.parse((fenced ? fenced[1] : raw).trim()) as Record<string, unknown>

      const result: Partial<ExtractionResult> = {}

      if (typeof data.currentLocationId === 'string' && data.currentLocationId !== 'unchanged') {
        result.currentLocationId = data.currentLocationId === 'null' || data.currentLocationId === ''
          ? null
          : data.currentLocationId
      } else if (data.currentLocationId === null) {
        result.currentLocationId = null
      }

      const targetId = result.currentLocationId !== undefined
        ? result.currentLocationId
        : currentId

      if (targetId && typeof data.stateChanges === 'object' && data.stateChanges !== null) {
        const changes = data.stateChanges as Record<string, unknown>
        const override: LocationOverride = {}
        if (typeof changes.lighting === 'string') override.lighting = changes.lighting
        if (typeof changes.atmosphere === 'string') override.atmosphere = changes.atmosphere
        if (typeof changes.soundscape === 'string') override.soundscape = changes.soundscape
        if (typeof changes.smells === 'string') override.smells = changes.smells
        if (typeof changes.description === 'string') override.description = changes.description
        if (Object.keys(override).length > 0) {
          result.locationOverrides = {
            ...ctx.currentState.locationOverrides,
            [targetId]: {
              ...(ctx.currentState.locationOverrides[targetId] ?? {}),
              ...override,
            },
          }
        }
      }

      return result
    } catch {
      return {}
    }
  },
}

// ─── Registry + runner ────────────────────────────────────────────────────────

const extractors: EntityExtractor[] = [locationExtractor]

export async function runExtraction(ctx: ExtractionContext): Promise<ChatEntityState> {
  const results = await Promise.all(extractors.map((e) => e.extract(ctx)))

  let state = { ...ctx.currentState }
  for (const result of results) {
    if (result.currentLocationId !== undefined) {
      state.currentLocationId = result.currentLocationId
    }
    if (result.locationOverrides) {
      state.locationOverrides = result.locationOverrides
    }
  }

  return state
}
