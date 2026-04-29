# SimpleChat — Generation Quality & Narrative Data Model Mandate

**Status:** Approved for design / pending implementation scheduling
**Scope:** Narrative data model schema, parse-text pipeline, generation depth, memory system
**Depends on:** `ai-refactor-mandate.md` (LLMAgent / parse service architecture must land first)

---

## Context

The AI agent layer refactor (`ai-refactor-mandate.md`) fixes the *engineering* quality of generation — one agent per task, no copy-paste, testable prompts. This document addresses the *narrative* quality: the depth of what gets extracted and stored, and the correctness of the data model that receives it.

A review of data generated from the story "Fall" revealed three intersecting problems:

1. **The schema is too flat.** Characters have no identity layers. Locations have no spatial relationships. The story entity has no themes, no act structure, and a one-word writing style field.
2. **The extraction pipeline is one-pass.** A single LLM call is asked to profile 12 characters, 30 locations, and a full timeline simultaneously. Quality degrades badly for important characters and produces hallucinated duplicates.
3. **The memory system is underused.** `CharacterMemory` and `CharacterDelta` form a powerful event-sourced character model, but the parser produces only shallow static snapshots. Memories are the foundation everything else should be built on — they are not yet being used as such.

---

## Principle: Memory as Ground Truth

> Every fact about a character that can change over time belongs in a memory, not in the character's base fields.

The existing `CharacterMemory → CharacterDelta` chain is already an event-sourced log. Replaying it forward from any anchor point gives you the character's state at that moment in the story. This is the right model. The problem is that the rest of the system does not yet use it as such.

**The full vision:**

- A character's base record holds only the facts that are true before the story begins and never change (name, species, lineage, innate abilities).
- Every significant event produces a memory. Every memory that changes something about the character carries a `CharacterDelta`.
- The effective character at any point in time is computed by `applyMemoryChain(base, chain)` — this already exists.
- When a chat is anchored to a specific memory, the system can only see memories up to that anchor. Future events do not exist yet. This is temporal integrity.

**Consequence for parse-text:** The parser's primary job is not to produce a character card — it is to produce a chain of memories with deltas that, when replayed, reconstruct the character as they exist at the end of the story. The character card is a bootstrap; the memories are the canon.

---

## Part 1 — Schema Changes

### 1.1 Character Identities

Some characters have multiple distinct forms or personas. Two fundamentally different cases exist:

**Aware dual-form** — the character fully knows and controls both forms (Alice: human disguise vs. succubus true form).
**Unknown linked identity** — the character does not know they are another entity (Alex does not know he is Michael reincarnated).

Both cases need to be representable without collapsing the characters into one record (they may appear as separate entities in the timeline) and without losing the link between them.

#### Schema Addition

```ts
// packages/types/src/character.ts

export const CharacterIdentitySchema = z.object({
  id: z.string(),
  name: z.string(),
  appearance: z.string().default(""),
  abilities: z.array(z.string()).default([]),
  selfAware: z.boolean().default(true),        // does this character know about this identity
  knownBy: z.array(z.string()).default([]),     // charIds who are aware this identity exists
  conditions: z.string().default(""),          // when/how this identity manifests
  notes: z.string().default(""),
})

export const CharacterSchema = z.object({
  // ... existing fields ...
  identities: z.array(CharacterIdentitySchema).default([]),
  linkedCharacterIds: z.array(z.string()).default([]),
  // linkedCharacterIds: other character records that are the same entity at a different
  // point in time or under a different name (Alex ↔ Michael, pre-fall Lucifer ↔ Samael)
})
```

**Prompt assembly impact:** When building the system prompt for a character, include only the identities where `selfAware: true` or where the chat's current state has revealed that identity. Identities unknown to the character and not yet revealed stay out of the prompt entirely.

**Parser impact:** The parser must detect alias usage (a name used for an entity already extracted) and link via `linkedCharacterIds` rather than creating a new character record.

---

### 1.2 Location Hierarchy

The current schema stores locations as a flat list. A room, a building, a city, and a realm are all the same entity type with no spatial relationship between them. This produces location explosion (31 locations for 10 scenes) and gives the system no map to reason about.

#### Schema Addition

```ts
// packages/types/src/location.ts

export const LocationSchema = z.object({
  // ... existing fields ...
  parentLocationId: z.string().nullable().default(null),
  // The location this one is contained within.
  // Hell → Ash Planes → Throne Room is expressed as:
  //   Throne Room.parentLocationId = Ash Planes
  //   Ash Planes.parentLocationId = Hell
  //   Hell.parentLocationId = null

  connectedLocationIds: z.array(z.string()).default([]),
  // Non-hierarchical connections — a door, a path, a portal.
  // Backstage connects to the Street via a stage door but neither contains the other.
})
```

**Navigation primitive:** From any location, characters can reach: children (sub-locations), parent (containing location), siblings (same parent), and connections (`connectedLocationIds`). This gives the context assembler a one-query neighbourhood map. No pathfinding needed — adjacency is enough for fiction.

**Parser impact:** The parser must first extract root locations (Hell, the Performance Venue, Heaven), then extract child locations, then link them. Children must not be created as independent top-level entries.

---

### 1.3 Story — Depth Fields

The current `Story` schema stores `writingStyle` as a single freeform string. This produces one-word values like `"Descriptive"` which carry almost no usable signal for prompt assembly.

#### Schema Addition

```ts
// packages/types/src/story.ts

export const WritingStyleSchema = z.object({
  prose: z.string().default(""),        // rhythm and density — "short punchy sentences", "flowing and dense"
  interiority: z.string().default(""),  // depth of internal monologue — "deep, characters' thoughts dominate"
  dialogue: z.string().default(""),     // style of speech — "naturalistic, emotionally clipped"
  pacing: z.string().default(""),       // scene rhythm — "slow-burning with sudden bursts of intensity"
  sensory: z.string().default(""),      // dominant senses — "tactile and temperature-focused"
})

export const StoryRulesSchema = z.object({
  worldRules: z.array(z.string()).default([]),
  // Physics of the universe — constraints that always apply.
  // Examples: "free will cannot be overridden even by God"
  //           "demons can enchant mortals through performance"
  //           "redemption is available to all but costs everything"

  storyRules: z.array(z.string()).default([]),
  // What this particular narrative demands of its characters.
  // Examples: "love must be tested before it can be accepted"
  //           "sacrifice is required for salvation"

  characterRules: z.array(z.string()).default([]),
  // Per-story constraints on specific characters.
  // Examples: "Alice cannot bring herself to kill someone she loves"
})

export const StorySchema = z.object({
  // ... existing fields ...
  writingStyle: WritingStyleSchema.default({}),    // replaces string
  rules: StoryRulesSchema.default({}),             // replaces string[]
  themes: z.array(z.string()).default([]),
  // Core thematic concerns — "sacrifice", "redemption", "identity", "free will"
  // Used for mood guidance and system prompt framing.
})
```

---

### 1.4 Memory — Temporal Integrity and Importance Tiers

The memory system must guarantee that when a chat is anchored to a point in the timeline, no information from after that point can reach the LLM. This is not currently enforced at the data level — it is only enforced by `resolveAccessibleMemories()` in `chats.ts`. The schema should make it easier to reason about.

#### Importance Tier Convention (no schema change, a documented contract)

| Tier | `importance` range | Examples |
|---|---|---|
| Genesis | 0.9 – 1.0 | Alice's reveal, Alex learning he is Michael, Lucifer's plan revealed |
| Character-defining | 0.7 – 0.89 | The three questions scene, Alice accepting Alex's kiss, Michael volunteering |
| Plot event | 0.4 – 0.69 | Vireath finding Alice, the gateway closing, the Victor-Mortis discovery |
| Incidental beat | 0.0 – 0.39 | Individual dialogue lines, atmospheric detail, minor reactions |

The parser and memory retrieval system must respect this. Genesis and character-defining memories should always be included in context when within the accessible chain. Incidental beats are candidates for pruning when context is full.

#### `sceneId` Addition

```ts
// packages/types/src/character-memory.ts

export const CharacterMemorySchema = z.object({
  // ... existing fields ...
  sceneId: z.string().nullable().default(null),
  // Groups memories that happen in the same scene/act.
  // Enables "what happened in this scene" queries without date logic.
  // Also used to prevent incidental beats from the same scene 
  // from duplicating context when important beats from the same scene are already loaded.
})
```

---

## Part 2 — Multi-Pass Extraction Pipeline

One-pass extraction fails at scale. When a single LLM call is asked to extract 12 characters, 30 locations, and a full timeline from 4,000 words, it produces:
- Shallow character cards (can't give each character its fair share of attention)
- Location duplication (no consolidation pass to catch duplicates)
- Missing relationships (no dedicated pass to find connections)
- No deltas (no pass to detect what changed for each character across the story)

The fix is a staged pipeline where each pass has a single narrow job.

### Pipeline Stages

```
Input text
  │
  ├─ [Stage 1] Census pass
  │    Job: "What named entities exist?" — characters, locations, scenes
  │    Output: entity manifest (names, types, rough scene list)
  │    Temperature: 0.1 — deterministic enumeration
  │    Chunking: runChunked over full text
  │
  ├─ [Stage 2] Story core pass
  │    Job: Extract title, premise, genres, tone, themes, writing style (all fields), rules (all tiers)
  │    Input: full text + entity manifest
  │    Temperature: 0.2
  │
  ├─ [Stage 3] Location pass
  │    Job: Extract all locations with hierarchy — root locations first, then children
  │    Input: full text + entity manifest
  │    Instruction: "Group locations that describe the same physical space. 
  │                  Identify which locations are contained inside others."
  │    Temperature: 0.1
  │
  ├─ [Stage 4] Per-character deep-dive (parallelisable)
  │    For each character in the manifest:
  │      Job: "Here is the full story. Extract EVERYTHING about [name]:
  │            appearance, species, lineage, abilities, personality (with evidence),
  │            speech patterns, fears (shown in action), motivations (shown in action).
  │            Do not write Unknown. If it is in the text, extract it."
  │      Input: full text anchored to passages mentioning this character
  │      Temperature: 0.2
  │
  ├─ [Stage 5] Relationship pass
  │    Job: For each character pair that appears in the same scene, extract relationship
  │    Input: full text + character list
  │    Temperature: 0.1
  │
  ├─ [Stage 6] Timeline + delta pass  ← THE CRITICAL PASS
  │    Job: For each scene in the manifest, in order:
  │      1. What happened? (memory summary)
  │      2. What changed for each character present? (CharacterDelta)
  │      3. What importance tier is this event?
  │      4. Which sceneId does this belong to?
  │    Input: full text, character list, scene manifest
  │    Temperature: 0.1
  │    Output: ordered CharacterMemory[] with deltas attached
  │
  └─ [Stage 7] Identity and alias resolution pass
       Job: "Are any of these characters the same person under a different name 
             or at a different point in time?"
       Input: character list + timeline
       Temperature: 0.1
       Output: linkedCharacterIds links + identity records
```

### `runChunked` Scope Expansion

`runChunked` was introduced for the memory pass. It should apply to every stage that processes long input:

| Stage | Current | Should use runChunked |
|---|---|---|
| Census | One call | Yes — full text may be long |
| Story core | One call | Yes |
| Location pass | One call | Yes |
| Per-character deep-dive | One call per character | Yes — each character's anchored passages |
| Timeline + delta pass | One call | Yes — this is the longest, most complex pass |

The chunking strategy for the delta pass differs from a simple linear walk: chunks should be scene-aligned, not byte-aligned. Splitting mid-scene would cause relationship and delta context to be lost. The sanitizer should be extended with a scene-boundary detector so `runChunked` can split on scene breaks (the `—scene name—` format used in "Fall" is already a clean delimiter).

---

## Part 3 — Character Delta Coverage

The `CharacterDelta` schema supports personality, fears, private knowledge, speech style, true motives, hidden emotional state, moral limits, appearance, clothing, reputation. These are exactly the fields that change most across a story — yet the parse-text feature currently produces zero deltas.

### What "Fall" should have produced

| Memory anchor | Character | Delta |
|---|---|---|
| Performance scene | Alice | reputation: "performer whose enchantment failed on one man" |
| Bedroom reveal | Alice | hiddenEmotionalState: "cold panic; shame; loss of control", fears.add: "being seen as a monster by someone she cares about" |
| Snow confrontation | Alice | hiddenEmotionalState: "defeated but beginning to accept", personality.add: "capable of accepting love" |
| After Alex's kiss | Alice | hiddenEmotionalState: "fears fading; inner warmth", personality.add: "fully accepts her own nature" |
| Forced return | Alice | hiddenEmotionalState: "grief; resignation" |
| Victor-Mortis discovery | Alex | privateKnowledge.add: "kings joined Lucifer by committing the worst acts imaginable", moralLimits: "previously firm; now questioning" |
| Runes appear | Alex | appearance: "glowing runes reading 'Michael' etched on arms", privateKnowledge.add: "he is Michael reincarnated" |
| Father confrontation | Alex | hiddenEmotionalState: "destroyed, then comforted by recognition", trueMotives: "to atone; to free everyone" |

Each of these is a `CharacterMemory` with `importance` set appropriately and a `CharacterDelta` attached. Without them, `applyMemoryChain` has nothing to replay — the effective character is always identical to the base.

### Contract for the delta pass

The Stage 6 prompt must explicitly ask:
> "For each event, list the fields that changed for each character present. Use the exact field names from the delta schema. If nothing changed for a character in this event, omit them. Do not invent changes that are not evidenced in the text."

---

## Part 4 — Memory Temporal Integrity

> When a chat is anchored at memory M, everything that happened after M must not exist.

This is already partially implemented via `resolveAccessibleMemories()`. The gaps:

1. **Character base fields leak future state.** If the parser puts Alice's final emotional state into her base `hiddenEmotionalState`, that state is visible regardless of the anchor. The fix: anything that changes must be in a delta, not in the base record. The base record is the character before the story begins.

2. **No enforcement at the storage layer.** There is nothing preventing a future write from injecting a memory with an earlier timestamp into the chain. The chain is ordered by creation time, not by story time. A `storyOrder` integer field on `CharacterMemory` would make sorting deterministic and prevent out-of-order insertion from corrupting the timeline.

3. **Genesis memories are not marked as such.** There is no way to distinguish "this character has always had this ability" from "this character gained this ability at scene 4." Genesis memories (importance 0.9–1.0 with no previousMemoryId) are the character's starting state. All other memories are deltas on top of that. This distinction should be explicit.

#### Schema Addition

```ts
// packages/types/src/character-memory.ts

export const CharacterMemorySchema = z.object({
  // ... existing fields ...
  storyOrder: z.number().int().default(0),
  // Explicit ordering within the story timeline.
  // Prevents creation-time ordering bugs and enables deterministic replay.
  // Set by the parser; can be adjusted by users.

  isGenesis: z.boolean().default(false),
  // True for the character's initial state memory (before the story begins).
  // Genesis memories are always included in context regardless of anchor.
  // Genesis memories carry deltas that establish starting appearance, abilities, etc.
})
```

---

## Part 5 — Relationship Temporal State

Relationships currently store a single static attitude (`publicAttitude`, `privateAttitude`, `trustLevel`, `emotion`). In any interesting story, these change. Alice's relationship with Alex progresses through five distinct phases across "Fall."

The minimal fix is to move relationship snapshots into memory deltas rather than trying to build a full relationship event log:

When Stage 6 produces a memory with a delta for character A, if the event also meaningfully changed the relationship between A and B, the delta should carry a `relationshipUpdate`:

```ts
// Addition to CharacterDeltaSchema
relationshipUpdates: z.array(z.object({
  charId: z.string(),
  trustLevel: z.number().min(0).max(10).optional(),
  emotion: z.string().optional(),
  publicAttitude: z.string().optional(),
  privateAttitude: z.string().optional(),
})).default([])
```

`applyMemoryChain` already iterates deltas — adding relationship mutation to that loop costs nothing architecturally.

---

## Part 6 — Context Assembly Consequences

The schema additions above all flow downstream into context assembly. When these changes land, `assembleContext` gains access to:

- The character's effective identity layer for the current story position (only aware forms, only revealed forms)
- The character's neighbourhood map (adjacent locations reachable from the current one)
- Full writing style breakdown — prose rhythm, interiority, dialogue style, pacing, sensory emphasis — all injectable into the system prompt
- Themes — injectable as a high-level framing note before the story block
- World rules and story rules, separated and injected at appropriate priority positions

None of this requires new LLM infrastructure. It requires the schema to carry the data and the parser to extract it.

---

## Summary: What Changes and Why

| Area | Current state | Target state | Why it matters |
|---|---|---|---|
| Character identities | No concept of dual forms or linked entities | `identities[]` + `linkedCharacterIds[]` | Alice's forms and Alex/Michael link are core to the story; prompt assembly must respect revelation state |
| Location hierarchy | Flat list, 31 entries for 10 scenes | Tree via `parentLocationId` + `connectedLocationIds` | Enables spatial reasoning, primitive navigation map, eliminates duplication |
| Writing style | One-word string | Five-field structured object | Prose rhythm, interiority, dialogue style — all needed for high-quality prompt framing |
| Story rules | Flat string array | `worldRules` / `storyRules` / `characterRules` | World physics and narrative demands require separate handling |
| Themes | Not stored | `themes: string[]` | First-class narrative context for mood and system prompt framing |
| Extraction pipeline | Single LLM pass | 7-stage multi-pass with `runChunked` everywhere | One pass cannot profile 12 characters accurately; staged passes with narrow jobs are the industry standard |
| Character deltas | Zero produced by parser | Delta per turning-point event | Without deltas, `applyMemoryChain` has nothing to replay — effective character equals base character forever |
| Memory temporal integrity | Partially enforced in application code | `storyOrder` + `isGenesis` enforced at data layer | Future state must not leak into past anchor points; the timeline is the source of truth |
| Memory importance | Flat (all beats equal) | Four-tier (genesis / character-defining / plot / incidental) | Retrieval must surface genesis and character-defining memories reliably; incidental beats should not crowd them out |
| Relationship state | Single static snapshot | Delta-driven via `relationshipUpdates` in memory | Relationships change — the memory chain that tracks character state should also track how relationships evolve |

---

## Implementation Order

This is a schema-first refactor. The correct order respects downstream dependencies:

1. **Types** — add all schema fields (`packages/types/src/`)
2. **Storage** — update storage functions to read/write new fields
3. **Parser pipeline** — implement staged multi-pass extraction using the `LLMAgent` architecture
4. **`applyMemoryChain`** — extend to handle `relationshipUpdates`
5. **Context assembly** — inject new fields (writing style breakdown, themes, world rules, identity layers, location neighbourhood)
6. **Frontend** — surface new fields in modals; add identity management UI; add location parent selector

Steps 1–3 can land independently of steps 4–6. The schema and storage changes are non-breaking — all new fields have defaults.
