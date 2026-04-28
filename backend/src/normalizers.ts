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

export function normaliseCharacter(c: Record<string, unknown>) {
  const rawRels = Array.isArray(c.relationships) ? c.relationships : [];
  const relationships = (rawRels as unknown[])
    .filter(
      (r): r is Record<string, unknown> => typeof r === "object" && r !== null,
    )
    .map(normaliseRelationship)
    .filter((r) => r.otherCharacterName);
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
  };
}

export function normaliseMemoryItem(m: Record<string, unknown>) {
  const rawDeltas =
    typeof m.deltas === "object" && m.deltas !== null
      ? (m.deltas as Record<string, unknown>)
      : null;
  const rawRelEffects =
    rawDeltas && Array.isArray(rawDeltas.relationships)
      ? (rawDeltas.relationships as unknown[])
      : [];
  const relationshipEffects = rawRelEffects
    .filter(
      (r): r is Record<string, unknown> => typeof r === "object" && r !== null,
    )
    .map(normaliseRelationship)
    .filter((r) => r.otherCharacterName);
  const deltasWithoutRelationships = rawDeltas
    ? Object.fromEntries(
        Object.entries(rawDeltas).filter(([k]) => k !== "relationships"),
      )
    : undefined;
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
    deltas:
      deltasWithoutRelationships &&
      Object.keys(deltasWithoutRelationships).length > 0
        ? deltasWithoutRelationships
        : undefined,
    relationshipEffects:
      relationshipEffects.length > 0 ? relationshipEffects : undefined,
  };
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
    rules: Array.isArray(data.rules)
      ? data.rules.filter((x): x is string => typeof x === "string")
      : [],
    writingStyle:
      typeof data.writingStyle === "string" ? data.writingStyle : "",
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
