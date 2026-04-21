import type { Character, CharacterMemory } from '@simplechat/types'

export function applyMemoryChain(base: Character, chain: CharacterMemory[]): Character {
  const effective: Character = JSON.parse(JSON.stringify(base))

  for (const memory of chain) {
    const d = memory.deltas
    if (!d) continue

    if (d.personality) {
      for (const trait of d.personality.add) {
        if (!effective.public.personality.includes(trait)) {
          effective.public.personality.push(trait)
        }
      }
      effective.public.personality = effective.public.personality.filter(
        (t) => !d.personality!.remove.includes(t),
      )
    }

    if (d.fears) {
      for (const fear of d.fears.add) {
        if (!effective.private.fears.includes(fear)) {
          effective.private.fears.push(fear)
        }
      }
      effective.private.fears = effective.private.fears.filter(
        (f) => !d.fears!.remove.includes(f),
      )
    }

    if (d.privateKnowledge) {
      for (const item of d.privateKnowledge.add) {
        if (!effective.private.privateKnowledge.includes(item)) {
          effective.private.privateKnowledge.push(item)
        }
      }
      effective.private.privateKnowledge = effective.private.privateKnowledge.filter(
        (k) => !d.privateKnowledge!.remove.includes(k),
      )
    }

    if (d.speechStyle !== undefined) effective.public.speechStyle = d.speechStyle
    if (d.trueMotives !== undefined) effective.private.trueMotives = d.trueMotives
    if (d.hiddenEmotionalState !== undefined) effective.private.hiddenEmotionalState = d.hiddenEmotionalState
    if (d.moralLimits !== undefined) effective.private.moralLimits = d.moralLimits
    if (d.appearance !== undefined) effective.public.appearance = d.appearance
    if (d.clothing !== undefined) effective.public.clothing = d.clothing
    if (d.reputation !== undefined) effective.public.reputation = d.reputation
  }

  return effective
}
