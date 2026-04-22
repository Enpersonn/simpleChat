import type {
  Character,
  CharacterMemory,
  ChatMode,
  Location,
  LocationOverride,
  OllamaMessage,
  Story,
  Turn,
} from "@simplechat/types";

const RESPONSE_LENGTH_MAP: Record<string, string> = {
  short: "Keep your response brief, around 1–3 short paragraphs.",
  medium: "Aim for 3–5 paragraphs of moderate length.",
  long: "Write a detailed response of 5–8 paragraphs.",
  "paragraph+": "Write an extended, immersive passage of 8 or more paragraphs.",
};

const MOOD_TAG_MAP: Record<string, string> = {
  tense: "Build micro-tension. Use short sentences. Withhold resolution.",
  warm: "Allow vulnerability. Slow the pace. Let characters connect genuinely.",
  eerie:
    "Describe environment with dread. Imply wrongness. Avoid direct horror.",
  playful: "Allow wit and banter. Light touch, natural rhythm.",
  melancholy: "Linger in emotional weight. Quiet moments. Understated grief.",
  "action-heavy":
    "Short sharp prose. Fast rhythm. Kinetic energy in every sentence.",
  mysterious: "Withhold information deliberately. Let ambiguity do the work.",
  romantic: "Lean into subtext and proximity. Let tension simmer.",
  dark: "Do not soften edges. Embrace moral complexity and consequence.",
  hopeful: "Allow light through the cracks. Small victories matter.",
};

function resolveTokens(text: string, characters: Character[]): string {
  const nonPersonas = characters.filter(
    (c) => !c.isUserPersona && !c.isNarrator,
  );
  const personas = characters.filter((c) => c.isUserPersona);
  return text
    .replace(/\{\{char_1\}\}/g, nonPersonas[0]?.name ?? "the character")
    .replace(/\{\{char_2\}\}/g, nonPersonas[1]?.name ?? "the second character")
    .replace(/\{\{user\}\}/g, personas[0]?.name ?? "the player");
}

// ─── Section builders ────────────────────────────────────────────────────────

function buildSpeakerInstructions(
  mode: ChatMode,
  speaker: Character | undefined,
  userPersonas: Character[],
  otherChars: Character[],
  speakerMemories: CharacterMemory[] = [],
  locations?: Location[],
): string {
  const parts: string[] = [];

  if (mode === "interactive") {
    if (speaker) {
      parts.push(
        `You are ${speaker.name}${speaker.role ? `, ${speaker.role}` : ""}. Stay completely in character at all times.`,
      );

      // History block: memories provide the WHY behind current traits.
      // Genesis memory is always first; sort oldest→newest by createdAt.
      const sorted = [...speakerMemories].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );
      if (sorted.length > 0) {
        const lines = sorted.map((m) => {
          const locName = m.locationId && locations
            ? locations.find((l) => l.id === m.locationId)?.name
            : undefined;
          return locName ? `• ${m.summary} (@ ${locName})` : `• ${m.summary}`;
        }).join("\n");
        parts.push(`\nYour history — the events that shaped who you are:\n${lines}`);
      }

      // Current state derived from the memory chain
      const hasState =
        speaker.public.personality.length > 0 ||
        speaker.public.speechStyle ||
        speaker.private.trueMotives ||
        speaker.private.fears.length > 0 ||
        speaker.private.hiddenEmotionalState;

      if (hasState) {
        parts.push("\nYour current state:");
        if (speaker.public.personality.length > 0)
          parts.push(`Observable traits: ${speaker.public.personality.join(", ")}.`);
        if (speaker.public.speechStyle)
          parts.push(`Speech style: ${speaker.public.speechStyle}.`);
        if (speaker.private.trueMotives)
          parts.push(`Private motivations (never reveal directly): ${speaker.private.trueMotives}.`);
        if (speaker.private.hiddenEmotionalState)
          parts.push(`Hidden emotional state: ${speaker.private.hiddenEmotionalState}.`);
        if (speaker.private.fears.length > 0)
          parts.push(`Hidden fears: ${speaker.private.fears.join(", ")}.`);
      }

      if (userPersonas.length > 0) {
        const personaNames = userPersonas.map((p) => p.name).join(" and ");
        parts.push(
          `\nYou are ONLY ${speaker.name}. Never write dialogue, actions, or thoughts for ${personaNames}. Wait for them to act — then respond as ${speaker.name}.`,
        );
      } else {
        parts.push(
          `\nYou are ONLY ${speaker.name}. Never write the user's dialogue, actions, or thoughts. Respond to what the user says — do not speak for them.`,
        );
      }
    } else {
      parts.push(
        "You are the narrator. Voice all characters and describe the scene.",
      );
      if (userPersonas.length > 0) {
        const personaNames = userPersonas.map((p) => p.name).join(" and ");
        parts.push(
          `Do not write dialogue or actions for ${personaNames} — they are controlled by the player.`,
        );
      }
    }
    parts.push(
      "Show emotion through behavior and subtext — not explicit statements.",
      "Use tight, purposeful dialogue with action beats instead of dialogue tags.",
      "Let scenes breathe with small gestures, pauses, environmental details.",
      "Never break character or step outside the fiction.",
      "Format physical actions and stage directions in *italics*. Spoken dialogue in \"quotes\".",
    );
  } else {
    parts.push(
      "You are the narrator of an ongoing story.",
      "Write in cinematic third-person. Alternate narration with dialogue.",
      "Use the pacing structure: action → internal thought → dialogue → environment.",
      "Subtext over explicit. Show, never tell.",
      "End each passage with a hook, shift, or unresolved beat.",
    );
  }

  return parts.join("\n");
}

function buildStoryBlock(story: Story, characters: Character[]): string {
  const parts: string[] = [];
  if (story.premise)
    parts.push(`\nSTORY: ${resolveTokens(story.premise, characters)}`);
  if (story.tone.length > 0) parts.push(`Tone: ${story.tone.join(", ")}.`);
  if (story.rules.length > 0)
    parts.push(
      `World rules: ${story.rules.map((r) => resolveTokens(r, characters)).join(" | ")}.`,
    );
  if (story.writingStyle)
    parts.push(
      `Writing style: ${resolveTokens(story.writingStyle, characters)}.`,
    );
  return parts.join("\n");
}

function buildPersonasBlock(userPersonas: Character[]): string {
  if (userPersonas.length === 0) return "";
  const descriptions = userPersonas
    .map((p) => {
      const parts = [`${p.name}${p.role ? ` (${p.role})` : ""}`];
      const demo = [
        p.public.age,
        p.public.gender,
        p.public.species !== "human" ? p.public.species : "",
      ]
        .filter(Boolean)
        .join(", ");
      if (demo) parts.push(demo);
      if (p.public.appearance)
        parts.push(
          p.public.clothing
            ? `${p.public.appearance} Wearing: ${p.public.clothing}`
            : p.public.appearance,
        );
      if (p.public.personality.length > 0)
        parts.push(p.public.personality.join(", "));
      if (p.public.speechStyle) parts.push(`speaks: ${p.public.speechStyle}`);
      return parts.join(" — ");
    })
    .join("; ");
  return `\nPLAYER CHARACTER: ${descriptions}`;
}

function buildOtherCharsBlock(
  otherChars: Character[],
  otherCharMemories: Map<string, CharacterMemory[]> = new Map(),
): string {
  if (otherChars.length === 0) return "";
  const descriptions = otherChars
    .map((c) => {
      const parts = [`${c.name}${c.role ? ` (${c.role})` : ""}`];
      const demo = [
        c.public.age,
        c.public.gender,
        c.public.species !== "human" ? c.public.species : "",
      ]
        .filter(Boolean)
        .join(", ");
      if (demo) parts.push(demo);
      if (c.public.appearance)
        parts.push(
          c.public.clothing
            ? `${c.public.appearance} Wearing: ${c.public.clothing}`
            : c.public.appearance,
        );
      if (c.public.personality.length > 0)
        parts.push(c.public.personality.join(", "));

      // Append the most important memory as context for who this person is now
      const mems = otherCharMemories.get(c.id) ?? [];
      const keyMem = mems
        .filter((m) => m.importance >= 0.7)
        .sort((a, b) => b.importance - a.importance)[0];
      if (keyMem) {
        const truncated =
          keyMem.summary.length > 120
            ? `${keyMem.summary.slice(0, 117)}…`
            : keyMem.summary;
        parts.push(`[${truncated}]`);
      }

      return parts.join(" — ");
    })
    .join(";\n");
  return `\nOTHER CHARACTERS:\n${descriptions}`;
}

export function buildLocationBlock(
  location: Location,
  overrides?: LocationOverride,
): string {
  const lighting = overrides?.lighting ?? location.lighting;
  const atmosphere = overrides?.atmosphere ?? location.atmosphere;
  const soundscape = overrides?.soundscape ?? location.soundscape;
  const smells = overrides?.smells ?? location.smells;
  const description = overrides?.description ?? location.description;

  const parts: string[] = [`\nCURRENT LOCATION: ${location.name}`];
  if (description) parts.push(description);
  if (location.layout) parts.push(`Layout: ${location.layout}`);
  if (lighting) parts.push(`Lighting: ${lighting}`);
  if (atmosphere) parts.push(`Atmosphere: ${atmosphere}`);
  if (soundscape) parts.push(`Sounds: ${soundscape}`);
  if (smells) parts.push(`Smells: ${smells}`);
  if (location.notes) parts.push(`Notes: ${location.notes}`);
  return parts.join("\n");
}

export function buildRelationshipsBlock(
  speaker: Character,
  presentChars: Character[],
): string {
  const presentIds = new Set(presentChars.map((c) => c.id));
  const relevant = speaker.relationships.filter((r) =>
    presentIds.has(r.charId),
  );
  if (relevant.length === 0) return "";
  const lines = relevant.map((r) => {
    const other = presentChars.find((c) => c.id === r.charId);
    const name = other?.name ?? r.charId;
    const parts: string[] = [name];
    if (r.emotion) parts.push(`(${r.emotion})`);
    if (r.publicAttitude) parts.push(r.publicAttitude);
    if (r.trustLevel !== 5) parts.push(`Trust: ${r.trustLevel}/10`);
    if (r.privateAttitude) parts.push(`[private: ${r.privateAttitude}]`);
    return parts.join(" — ");
  });
  return `\nRELATIONSHIPS IN THIS SCENE:\n${lines.join("\n")}`;
}

export function buildCharacterMemoriesBlock(
  characterName: string,
  memories: CharacterMemory[],
  locations?: Location[],
): string {
  if (memories.length === 0) return "";
  const lines = memories.map((m) => {
    const locName = m.locationId && locations
      ? locations.find((l) => l.id === m.locationId)?.name
      : undefined;
    return locName ? `- ${m.summary} (@ ${locName})` : `- ${m.summary}`;
  });
  return `\nRELEVANT MEMORIES FOR ${characterName.toUpperCase()}:\n${lines.join("\n")}`;
}

export function buildCharacterLocationFeelingBlock(
  speaker: Character,
  locationId: string | null | undefined,
): string {
  if (!locationId) return "";
  const rel = speaker.locationRelationships?.find((r) => r.locationId === locationId);
  if (!rel) return "";
  const parts: string[] = [];
  if (rel.emotion) parts.push(rel.emotion);
  if (rel.comfort !== 5 || rel.tension > 0) {
    const comfortLabel = rel.comfort >= 7 ? "at ease" : rel.comfort <= 3 ? "uncomfortable" : "neutral";
    const tensionLabel = rel.tension >= 7 ? "very tense" : rel.tension >= 4 ? "tense" : null;
    const stateDesc = [comfortLabel, tensionLabel].filter(Boolean).join(", ");
    if (stateDesc) parts.push(stateDesc);
  }
  if (rel.notes) parts.push(rel.notes);
  if (parts.length === 0) return "";
  return `\nYOUR FEELINGS ABOUT THIS PLACE: ${parts.join(" — ")}`;
}

function buildMoodBlock(moodTags: string[]): string {
  const instructions = moodTags.map((tag) => MOOD_TAG_MAP[tag]).filter(Boolean);
  if (instructions.length === 0) return "";
  return `\nMOOD GUIDANCE: ${instructions.join(" ")}`;
}

// ─── Assembly ────────────────────────────────────────────────────────────────

export interface AssembleOptions {
  story: Story;
  characters: Character[];
  activeSpeaker: string;
  recentTurns: Turn[];
  mode: ChatMode;
  moodTags?: string[];
  responseLength?: string;
  feelText?: string;
  globalNote?: string;
  currentLocation?: Location;
  locationOverrides?: LocationOverride;
  locations?: Location[];
  /** Memories relevant to the active speaker — shown as their lived history. */
  speakerMemories?: CharacterMemory[];
  /** Key memories per non-speaker character — appended as one-line context. */
  otherCharMemories?: Map<string, CharacterMemory[]>;
  /** @deprecated Use speakerMemories instead. Kept for callers not yet updated. */
  relevantMemories?: CharacterMemory[];
}

export function assembleContext(opts: AssembleOptions): OllamaMessage[] {
  const {
    story,
    characters,
    activeSpeaker,
    recentTurns,
    mode,
    moodTags = [],
    responseLength = "medium",
    feelText = "",
    globalNote = "",
    currentLocation,
    locationOverrides,
    locations,
    speakerMemories,
    otherCharMemories,
    relevantMemories = [],
  } = opts;

  const resolvedSpeakerMemories = speakerMemories ?? relevantMemories;

  const speaker = characters.find((c) => c.id === activeSpeaker);
  const userPersonas = characters.filter((c) => c.isUserPersona);
  const otherChars = characters.filter(
    (c) => c.id !== activeSpeaker && !c.isUserPersona,
  );

  const systemParts: string[] = [];

  if (story.systemPromptOverride?.trim()) {
    systemParts.push(story.systemPromptOverride.trim());
  } else {
    systemParts.push(
      buildSpeakerInstructions(mode, speaker, userPersonas, otherChars, resolvedSpeakerMemories, locations),
    );
  }

  const storyBlock = buildStoryBlock(story, characters);
  if (storyBlock) systemParts.push(storyBlock);

  const personasBlock = buildPersonasBlock(userPersonas);
  if (personasBlock) systemParts.push(personasBlock);

  const otherCharsBlock = buildOtherCharsBlock(otherChars, otherCharMemories);
  if (otherCharsBlock) systemParts.push(otherCharsBlock);

  if (speaker) {
    const relBlock = buildRelationshipsBlock(speaker, [
      ...userPersonas,
      ...otherChars,
    ]);
    if (relBlock) systemParts.push(relBlock);
  }

  if (currentLocation) {
    systemParts.push(buildLocationBlock(currentLocation, locationOverrides));
    if (speaker) {
      const feelingBlock = buildCharacterLocationFeelingBlock(speaker, currentLocation.id);
      if (feelingBlock) systemParts.push(feelingBlock);
    }
  }

  const moodBlock = buildMoodBlock(moodTags);
  if (moodBlock) systemParts.push(moodBlock);

  systemParts.push(
    RESPONSE_LENGTH_MAP[responseLength] ?? RESPONSE_LENGTH_MAP.medium,
  );

  if (feelText.trim()) {
    systemParts.push(`Style note from author: ${feelText.trim()}`);
  }

  if (globalNote.trim()) {
    systemParts.push(`\nGLOBAL NOTE: ${globalNote.trim()}`);
  }

  const systemPrompt = systemParts.join("\n");
  const messages: OllamaMessage[] = [{ role: "system", content: systemPrompt }];

  const windowTurns = recentTurns.slice(-30);
  for (const turn of windowTurns) {
    messages.push({
      role: turn.role,
      content: resolveTokens(turn.text, characters),
    });
  }

  return messages;
}
