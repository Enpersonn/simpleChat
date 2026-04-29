export function normaliseRelationship(r: Record<string, unknown>) {
  return {
    otherCharacterName:
      typeof r.otherCharacterName === "string" ? r.otherCharacterName : "",
    emotion: typeof r.emotion === "string" ? r.emotion : "",
    publicAttitude:
      typeof r.publicAttitude === "string" ? r.publicAttitude : "",
    privateAttitude:
      typeof r.privateAttitude === "string" ? r.privateAttitude : "",
    trustLevel:
      typeof r.trustLevel === "number"
        ? Math.min(10, Math.max(0, r.trustLevel))
        : 5,
  };
}

function normaliseIdentity(raw: Record<string, unknown>) {
  return {
    id: typeof raw.id === "string" ? raw.id : crypto.randomUUID(),
    name: typeof raw.name === "string" ? raw.name : "",
    appearance: typeof raw.appearance === "string" ? raw.appearance : "",
    abilities: Array.isArray(raw.abilities)
      ? raw.abilities.filter((x): x is string => typeof x === "string")
      : [],
    selfAware: raw.selfAware !== false,
    knownBy: Array.isArray(raw.knownBy)
      ? raw.knownBy.filter((x): x is string => typeof x === "string")
      : [],
    conditions: typeof raw.conditions === "string" ? raw.conditions : "",
    notes: typeof raw.notes === "string" ? raw.notes : "",
  };
}

export function normaliseCharacter(c: Record<string, unknown>) {
  const rawRels = Array.isArray(c.relationships) ? c.relationships : [];
  const relationships = (rawRels as unknown[])
    .filter(
      (r): r is Record<string, unknown> => typeof r === "object" && r !== null,
    )
    .map(normaliseRelationship)
    .filter((r) => r.otherCharacterName);
  const rawIdentities = Array.isArray(c.identities) ? c.identities : [];
  const identities = (rawIdentities as unknown[])
    .filter(
      (i): i is Record<string, unknown> => typeof i === "object" && i !== null,
    )
    .map(normaliseIdentity)
    .filter((i) => i.name);
  return {
    name: typeof c.name === "string" ? c.name : "",
    role: typeof c.role === "string" ? c.role : "",
    isUserPersona: c.isUserPersona === true,
    age: typeof c.age === "string" ? c.age : "",
    gender: typeof c.gender === "string" ? c.gender : "",
    species: typeof c.species === "string" ? c.species : "human",
    clothing: typeof c.clothing === "string" ? c.clothing : "",
    appearance: typeof c.appearance === "string" ? c.appearance : "",
    personality: Array.isArray(c.personality)
      ? c.personality.filter((x): x is string => typeof x === "string")
      : [],
    speechStyle: typeof c.speechStyle === "string" ? c.speechStyle : "",
    trueMotives: typeof c.trueMotives === "string" ? c.trueMotives : "",
    fears: Array.isArray(c.fears)
      ? c.fears.filter((x): x is string => typeof x === "string")
      : [],
    relationships,
    identities,
    linkedCharacterNames: Array.isArray(c.linkedCharacterNames)
      ? c.linkedCharacterNames.filter((x): x is string => typeof x === "string")
      : [],
  };
}

export function normaliseLocation(l: Record<string, unknown>) {
  return {
    name: typeof l.name === "string" ? l.name : "",
    description: typeof l.description === "string" ? l.description : "",
    layout: typeof l.layout === "string" ? l.layout : "",
    lighting: typeof l.lighting === "string" ? l.lighting : "",
    atmosphere: typeof l.atmosphere === "string" ? l.atmosphere : "",
    soundscape: typeof l.soundscape === "string" ? l.soundscape : "",
    smells: typeof l.smells === "string" ? l.smells : "",
    notes: typeof l.notes === "string" ? l.notes : "",
    tags: Array.isArray(l.tags)
      ? l.tags.filter((x): x is string => typeof x === "string")
      : [],
    parentLocationName:
      typeof l.parentLocationName === "string" ? l.parentLocationName : null,
    connectedLocationNames: Array.isArray(l.connectedLocationNames)
      ? l.connectedLocationNames.filter((x): x is string => typeof x === "string")
      : [],
  };
}

export function normaliseMemoryItem(m: Record<string, unknown>) {
  const rawEffects = Array.isArray(m.effects) ? m.effects : [];
  const effects = (rawEffects as unknown[])
    .filter(
      (e): e is Record<string, unknown> => typeof e === "object" && e !== null,
    )
    .filter(
      (e) =>
        typeof e.path === "string" &&
        e.path.length > 0 &&
        typeof e.op === "string",
    )
    .map((e) => ({
      path: e.path as string,
      op: e.op as string,
      value: e.value,
      weight: typeof e.weight === "number" ? e.weight : 1,
      entityType: typeof e.entityType === "string" ? e.entityType : "character",
      ...(typeof e.targetId === "string" ? { targetId: e.targetId } : {}),
    }));
  return {
    characterName: typeof m.characterName === "string" ? m.characterName : "",
    summary: typeof m.summary === "string" ? m.summary : "",
    tags: Array.isArray(m.tags)
      ? m.tags.filter((t): t is string => typeof t === "string")
      : [],
    importance:
      typeof m.importance === "number"
        ? Math.min(1, Math.max(0, m.importance))
        : 0.5,
    sceneId: typeof m.sceneId === "string" ? m.sceneId : null,
    storyOrder: typeof m.storyOrder === "number" ? Math.trunc(m.storyOrder) : 0,
    isGenesis: m.isGenesis === true,
    deltas: effects.length > 0 ? { effects } : { effects: [] },
  };
}

function normaliseWritingStyle(raw: unknown) {
  if (typeof raw === "string") return { prose: raw, interiority: "", dialogue: "", pacing: "", sensory: "" };
  if (typeof raw === "object" && raw !== null) {
    const r = raw as Record<string, unknown>;
    return {
      prose: typeof r.prose === "string" ? r.prose : "",
      interiority: typeof r.interiority === "string" ? r.interiority : "",
      dialogue: typeof r.dialogue === "string" ? r.dialogue : "",
      pacing: typeof r.pacing === "string" ? r.pacing : "",
      sensory: typeof r.sensory === "string" ? r.sensory : "",
    };
  }
  return { prose: "", interiority: "", dialogue: "", pacing: "", sensory: "" };
}

function normaliseStoryRules(raw: unknown) {
  if (Array.isArray(raw)) return { worldRules: raw.filter((x): x is string => typeof x === "string"), storyRules: [], characterRules: [] };
  if (typeof raw === "object" && raw !== null) {
    const r = raw as Record<string, unknown>;
    return {
      worldRules: Array.isArray(r.worldRules) ? r.worldRules.filter((x): x is string => typeof x === "string") : [],
      storyRules: Array.isArray(r.storyRules) ? r.storyRules.filter((x): x is string => typeof x === "string") : [],
      characterRules: Array.isArray(r.characterRules) ? r.characterRules.filter((x): x is string => typeof x === "string") : [],
    };
  }
  return { worldRules: [], storyRules: [], characterRules: [] };
}

export function normaliseStoryCore(
  data: Record<string, unknown>,
  opts?: { includeTitle?: boolean; includePremise?: boolean },
) {
  return {
    ...(opts?.includeTitle && typeof data.title === "string"
      ? { title: data.title }
      : {}),
    ...(opts?.includePremise && typeof data.premise === "string"
      ? { premise: data.premise }
      : {}),
    genres: Array.isArray(data.genres)
      ? data.genres.filter((x): x is string => typeof x === "string")
      : [],
    tone: Array.isArray(data.tone)
      ? data.tone.filter((x): x is string => typeof x === "string")
      : [],
    themes: Array.isArray(data.themes)
      ? data.themes.filter((x): x is string => typeof x === "string")
      : [],
    rules: normaliseStoryRules(data.rules),
    writingStyle: normaliseWritingStyle(data.writingStyle),
  };
}

export function parseArray<T>(
  data: Record<string, unknown>,
  key: string,
  normalise: (item: Record<string, unknown>) => T,
  filter: (item: T) => boolean,
): T[] {
  const raw = Array.isArray(data[key]) ? (data[key] as unknown[]) : [];
  return raw
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    )
    .map(normalise)
    .filter(filter);
}
