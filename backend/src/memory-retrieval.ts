import type { CharacterMemory, Turn } from '@simplechat/types'
import { streamChat } from './ollama.js'

function extractKeywords(turns: Turn[]): Set<string> {
  const text = turns
    .slice(-5)
    .map((t) => t.text.toLowerCase())
    .join(' ')
  // Split on non-word chars, filter short/common words
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'was', 'are', 'were', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'that', 'this', 'have', 'had', 'has', 'do', 'did', 'not', 'be', 'been'])
  return new Set(
    text
      .split(/\W+/)
      .filter((w) => w.length > 3 && !stopWords.has(w)),
  )
}

function scoreByTags(memory: CharacterMemory, keywords: Set<string>): number {
  return memory.tags.filter((tag) => keywords.has(tag.toLowerCase())).length
}

export async function findRelevantMemories(
  memories: CharacterMemory[],
  recentTurns: Turn[],
  maxResults = 5,
): Promise<CharacterMemory[]> {
  if (memories.length === 0) return []

  const alwaysInclude = memories.filter((m) => m.importance >= 0.8)
  const alwaysIds = new Set(alwaysInclude.map((m) => m.id))

  const keywords = extractKeywords(recentTurns)
  const tagMatches = memories
    .filter((m) => !alwaysIds.has(m.id))
    .map((m) => ({ memory: m, score: scoreByTags(m, keywords) }))
    .filter((x) => x.score >= 1)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.memory)

  const combined = [...alwaysInclude, ...tagMatches]
  if (combined.length >= maxResults) {
    return combined.slice(0, maxResults)
  }

  // LLM fallback: find additional relevant memories not yet included
  const remaining = memories.filter((m) => !new Set(combined.map((c) => c.id)).has(m.id))
  if (remaining.length === 0) return combined.slice(0, maxResults)

  const needed = maxResults - combined.length
  const contextText = recentTurns
    .slice(-3)
    .map((t) => `${t.role}: ${t.text}`)
    .join('\n')
  const memoryList = remaining
    .map((m) => `{"id":"${m.id}","summary":${JSON.stringify(m.summary)},"tags":${JSON.stringify(m.tags)}}`)
    .join('\n')

  let raw = ''
  try {
    await streamChat({
      messages: [
        {
          role: 'system',
          content:
            'You are a memory relevance filter. Return ONLY a JSON array of memory IDs (strings) that are relevant to the current scene. Return at most ' +
            needed +
            ' IDs. If none are relevant, return [].',
        },
        {
          role: 'user',
          content: `Current scene:\n${contextText}\n\nAvailable memories:\n${memoryList}`,
        },
      ],
      temperature: 0.1,
      onChunk: (chunk) => { raw += chunk },
    })

    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
    const ids: unknown = JSON.parse((fenced ? fenced[1] : raw).trim())
    if (Array.isArray(ids)) {
      const idSet = new Set(ids.filter((x): x is string => typeof x === 'string'))
      const llmPicked = remaining.filter((m) => idSet.has(m.id)).slice(0, needed)
      return [...combined, ...llmPicked].slice(0, maxResults)
    }
  } catch {
    // LLM call failed — return what tag matching found
  }

  return combined.slice(0, maxResults)
}
