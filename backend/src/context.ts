import { type Story, type Character, type Turn, type OllamaMessage, type ChatMode } from '@simplechat/types'

const RESPONSE_LENGTH_MAP: Record<string, string> = {
  short: 'Keep your response brief, around 1–3 short paragraphs.',
  medium: 'Aim for 3–5 paragraphs of moderate length.',
  long: 'Write a detailed response of 5–8 paragraphs.',
  'paragraph+': 'Write an extended, immersive passage of 8 or more paragraphs.',
}

const MOOD_TAG_MAP: Record<string, string> = {
  tense: 'Build micro-tension. Use short sentences. Withhold resolution.',
  warm: 'Allow vulnerability. Slow the pace. Let characters connect genuinely.',
  eerie: 'Describe environment with dread. Imply wrongness. Avoid direct horror.',
  playful: 'Allow wit and banter. Light touch, natural rhythm.',
  melancholy: 'Linger in emotional weight. Quiet moments. Understated grief.',
  'action-heavy': 'Short sharp prose. Fast rhythm. Kinetic energy in every sentence.',
  mysterious: 'Withhold information deliberately. Let ambiguity do the work.',
  romantic: 'Lean into subtext and proximity. Let tension simmer.',
  dark: 'Do not soften edges. Embrace moral complexity and consequence.',
  hopeful: 'Allow light through the cracks. Small victories matter.',
}

function resolveTokens(text: string, characters: Character[]): string {
  const nonPersonas = characters.filter((c) => !c.isUserPersona && !c.isNarrator)
  const personas = characters.filter((c) => c.isUserPersona)
  return text
    .replace(/\{\{char_1\}\}/g, nonPersonas[0]?.name ?? 'the character')
    .replace(/\{\{char_2\}\}/g, nonPersonas[1]?.name ?? 'the second character')
    .replace(/\{\{user\}\}/g, personas[0]?.name ?? 'the player')
}

export interface AssembleOptions {
  story: Story
  characters: Character[]
  activeSpeaker: string
  recentTurns: Turn[]
  mode: ChatMode
  moodTags?: string[]
  responseLength?: string
  feelText?: string
  globalNote?: string
}

export function assembleContext(opts: AssembleOptions): OllamaMessage[] {
  const {
    story,
    characters,
    activeSpeaker,
    recentTurns,
    mode,
    moodTags = [],
    responseLength = 'medium',
    feelText = '',
    globalNote = '',
  } = opts

  const speaker = characters.find((c) => c.id === activeSpeaker)
  const userPersonas = characters.filter((c) => c.isUserPersona)
  const otherChars = characters.filter((c) => c.id !== activeSpeaker && !c.isUserPersona)

  const systemParts: string[] = []

  // If the story has a full system prompt override, use it instead of the default instructions
  if (story.systemPromptOverride?.trim()) {
    systemParts.push(story.systemPromptOverride.trim())
  } else if (mode === 'interactive') {
    if (speaker) {
      systemParts.push(
        `You are ${speaker.name}${speaker.role ? `, ${speaker.role}` : ''}. Stay completely in character at all times.`,
      )
      if (speaker.public.personality.length > 0) {
        systemParts.push(`Your observable traits: ${speaker.public.personality.join(', ')}.`)
      }
      if (speaker.public.speechStyle) {
        systemParts.push(`Your speech style: ${speaker.public.speechStyle}.`)
      }
      if (speaker.private.trueMotives) {
        systemParts.push(`Your private motivations (never reveal directly): ${speaker.private.trueMotives}.`)
      }
      if (speaker.private.fears.length > 0) {
        systemParts.push(`Your hidden fears: ${speaker.private.fears.join(', ')}.`)
      }

      // Explicit role boundary: prevent LLM from writing the user's character
      if (userPersonas.length > 0) {
        const personaNames = userPersonas.map((p) => p.name).join(' and ')
        systemParts.push(
          `\nYou are ONLY ${speaker.name}. Never write dialogue, actions, or thoughts for ${personaNames}. Wait for them to act — then respond as ${speaker.name}.`,
        )
      } else {
        systemParts.push(
          `\nYou are ONLY ${speaker.name}. Never write the user's dialogue, actions, or thoughts. Respond to what the user says — do not speak for them.`,
        )
      }
    } else {
      systemParts.push('You are the narrator. Voice all characters and describe the scene.')
      if (userPersonas.length > 0) {
        const personaNames = userPersonas.map((p) => p.name).join(' and ')
        systemParts.push(`Do not write dialogue or actions for ${personaNames} — they are controlled by the player.`)
      }
    }
    systemParts.push(
      'Show emotion through behavior and subtext — not explicit statements.',
      'Use tight, purposeful dialogue with action beats instead of dialogue tags.',
      'Let scenes breathe with small gestures, pauses, environmental details.',
      'Never break character or step outside the fiction.',
    )
  } else {
    systemParts.push(
      'You are the narrator of an ongoing story.',
      'Write in cinematic third-person. Alternate narration with dialogue.',
      'Use the pacing structure: action → internal thought → dialogue → environment.',
      'Subtext over explicit. Show, never tell.',
      'End each passage with a hook, shift, or unresolved beat.',
    )
  }

  // Story world
  if (story.premise) systemParts.push(`\nSTORY: ${resolveTokens(story.premise, characters)}`)
  if (story.tone.length > 0) systemParts.push(`Tone: ${story.tone.join(', ')}.`)
  if (story.rules.length > 0) systemParts.push(`World rules: ${story.rules.map((r) => resolveTokens(r, characters)).join(' | ')}.`)
  if (story.writingStyle) systemParts.push(`Writing style: ${resolveTokens(story.writingStyle, characters)}.`)

  // User personas (player characters)
  if (userPersonas.length > 0) {
    const personaDescriptions = userPersonas
      .map((p) => {
        const parts = [`${p.name}${p.role ? ` (${p.role})` : ''}`]
        const demo = [p.public.age, p.public.gender, p.public.species !== 'human' ? p.public.species : ''].filter(Boolean).join(', ')
        if (demo) parts.push(demo)
        if (p.public.appearance) parts.push(p.public.clothing ? `${p.public.appearance} Wearing: ${p.public.clothing}` : p.public.appearance)
        if (p.public.personality.length > 0) parts.push(p.public.personality.join(', '))
        if (p.public.speechStyle) parts.push(`speaks: ${p.public.speechStyle}`)
        return parts.join(' — ')
      })
      .join('; ')
    systemParts.push(`\nPLAYER CHARACTER: ${personaDescriptions}`)
  }

  // Other characters (public layer only)
  if (otherChars.length > 0) {
    const charDescriptions = otherChars
      .map((c) => {
        const parts = [`${c.name}${c.role ? ` (${c.role})` : ''}`]
        const demo = [c.public.age, c.public.gender, c.public.species !== 'human' ? c.public.species : ''].filter(Boolean).join(', ')
        if (demo) parts.push(demo)
        if (c.public.appearance) parts.push(c.public.clothing ? `${c.public.appearance} Wearing: ${c.public.clothing}` : c.public.appearance)
        if (c.public.personality.length > 0) parts.push(c.public.personality.join(', '))
        return parts.join(' — ')
      })
      .join('; ')
    systemParts.push(`\nOTHER CHARACTERS: ${charDescriptions}.`)
  }

  // Mood instructions
  const moodInstructions = moodTags.map((tag) => MOOD_TAG_MAP[tag]).filter(Boolean)
  if (moodInstructions.length > 0) {
    systemParts.push(`\nMOOD GUIDANCE: ${moodInstructions.join(' ')}`)
  }

  // Response length
  const lengthInstruction = RESPONSE_LENGTH_MAP[responseLength] ?? RESPONSE_LENGTH_MAP.medium
  systemParts.push(lengthInstruction)

  // Feel text
  if (feelText.trim()) {
    systemParts.push(`Style note from author: ${feelText.trim()}`)
  }

  // Global note from settings (appended last)
  if (globalNote.trim()) {
    systemParts.push(`\nGLOBAL NOTE: ${globalNote.trim()}`)
  }

  const systemPrompt = systemParts.join('\n')

  const messages: OllamaMessage[] = [{ role: 'system', content: systemPrompt }]

  const windowTurns = recentTurns.slice(-30)
  for (const turn of windowTurns) {
    messages.push({ role: turn.role, content: resolveTokens(turn.text, characters) })
  }

  return messages
}
