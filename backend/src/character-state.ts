import type { Character, CharacterMemory } from "@simplechat/types";

function blankBase(char: Character): Character {
  return {
    ...char,
    public: {
      appearance: '',
      personality: [],
      speechStyle: '',
      reputation: '',
      voiceNotes: char.public.voiceNotes,
      age: char.public.age,
      gender: char.public.gender,
      species: char.public.species,
      clothing: '',
    },
    private: {
      trueMotives: '',
      fears: [],
      privateKnowledge: [],
      moralLimits: '',
      hiddenEmotionalState: '',
    },
    relationships: [],
    locationRelationships: [],
  }
}

export function applyMemoryChain(
  base: Character,
  chain: CharacterMemory[],
): Character {
  const effective: Character = JSON.parse(JSON.stringify(
    base.genesisMemoryId ? blankBase(base) : base
  ));

  for (const memory of chain) {
    const d = memory.deltas;
    if (!d) continue;

    if (d.personality) {
      for (const trait of d.personality.add) {
        if (!effective.public.personality.includes(trait)) {
          effective.public.personality.push(trait);
        }
      }
      effective.public.personality = effective.public.personality.filter(
        (t) => !d.personality!.remove.includes(t),
      );
    }

    if (d.fears) {
      for (const fear of d.fears.add) {
        if (!effective.private.fears.includes(fear)) {
          effective.private.fears.push(fear);
        }
      }
      effective.private.fears = effective.private.fears.filter(
        (f) => !d.fears!.remove.includes(f),
      );
    }

    if (d.privateKnowledge) {
      for (const item of d.privateKnowledge.add) {
        if (!effective.private.privateKnowledge.includes(item)) {
          effective.private.privateKnowledge.push(item);
        }
      }
      effective.private.privateKnowledge =
        effective.private.privateKnowledge.filter(
          (k) => !d.privateKnowledge!.remove.includes(k),
        );
    }

    if (d.speechStyle !== undefined)
      effective.public.speechStyle = d.speechStyle;
    if (d.trueMotives !== undefined)
      effective.private.trueMotives = d.trueMotives;
    if (d.hiddenEmotionalState !== undefined)
      effective.private.hiddenEmotionalState = d.hiddenEmotionalState;
    if (d.moralLimits !== undefined)
      effective.private.moralLimits = d.moralLimits;
    if (d.appearance !== undefined) effective.public.appearance = d.appearance;
    if (d.clothing !== undefined) effective.public.clothing = d.clothing;
    if (d.reputation !== undefined) effective.public.reputation = d.reputation;

    if (d.relationships) {
      for (const rel of d.relationships) {
        const idx = effective.relationships.findIndex(
          (r) => r.charId === rel.charId,
        );
        const base =
          idx >= 0
            ? effective.relationships[idx]
            : {
                charId: rel.charId,
                publicAttitude: "",
                privateAttitude: "",
                history: "",
                trustLevel: 5,
                visibility: "public" as const,
                emotion: "",
              };
        const updated = {
          ...base,
          ...(rel.emotion !== undefined ? { emotion: rel.emotion } : {}),
          ...(rel.publicAttitude !== undefined
            ? { publicAttitude: rel.publicAttitude }
            : {}),
          ...(rel.privateAttitude !== undefined
            ? { privateAttitude: rel.privateAttitude }
            : {}),
          ...(rel.trustLevel !== undefined
            ? { trustLevel: rel.trustLevel }
            : {}),
          sourceMemoryId: memory.id,
        };
        if (idx >= 0) effective.relationships[idx] = updated;
        else effective.relationships.push(updated);
      }
    }

    if (d.locationRelationships) {
      for (const lr of d.locationRelationships) {
        const idx = effective.locationRelationships.findIndex(
          (r) => r.locationId === lr.locationId,
        );
        const existing =
          idx >= 0
            ? effective.locationRelationships[idx]
            : { locationId: lr.locationId, comfort: 5, tension: 0, emotion: '', notes: '', sourceMemoryId: memory.id };
        const updated = {
          ...existing,
          ...(lr.comfort !== undefined ? { comfort: lr.comfort } : {}),
          ...(lr.tension !== undefined ? { tension: lr.tension } : {}),
          ...(lr.emotion !== undefined ? { emotion: lr.emotion } : {}),
          ...(lr.notes !== undefined ? { notes: lr.notes } : {}),
          sourceMemoryId: memory.id,
        };
        if (idx >= 0) effective.locationRelationships[idx] = updated;
        else effective.locationRelationships.push(updated);
      }
    }
  }

  return effective;
}
