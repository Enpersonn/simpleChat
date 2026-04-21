# SimpleChat — Agent Reference

This document is the primary reference for any AI agent working on this codebase. Read it fully before making changes.

---

## What This Is

SimpleChat is an AI-assisted collaborative fiction and roleplay tool. Users create **Stories** containing **Characters** and **Locations**, then hold **Chats** where an Ollama-backed LLM responds in-character. The system assembles a rich system prompt from story context, character data, the active location, and selectively retrieved character memories before each LLM call.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Preact, Vite, Zustand, TypeScript, CSS Modules |
| Backend | Fastify (v5), Node.js ESM, TypeScript |
| Shared types | `packages/types` — Zod schemas, exported as `@simplechat/types` |
| LLM | Ollama (local), `/api/chat` streaming endpoint |
| Storage | Plain JSON files on disk — no database |
| Linting/format | Biome |

---

## Repo Layout

```
simplechat/
├── CLAUDE.md              # Loads this file; holds architectural principles
├── AGENTS.md              # This file — full project reference
├── packages/
│   └── types/src/         # Shared Zod schemas + TypeScript types
│       ├── story.ts
│       ├── character.ts
│       ├── character-memory.ts
│       ├── chat.ts
│       ├── chat-state.ts
│       ├── location.ts
│       ├── memory.ts      # Chat-level memory items (legacy/separate from character memories)
│       ├── settings.ts
│       ├── ollama.ts
│       └── index.ts       # Re-exports everything
├── backend/src/
│   ├── index.ts           # Fastify app + route registration
│   ├── config.ts          # Settings persistence, dataDir(), PORT/HOST
│   ├── storage.ts         # ALL file-based CRUD for every entity type
│   ├── context.ts         # LLM system prompt assembly (section builders)
│   ├── character-state.ts # applyMemoryChain() — derive effective character from delta chain
│   ├── memory-retrieval.ts# Tags-first + LLM-fallback character memory retrieval
│   ├── extraction.ts      # Entity extractor registry; detects state changes post-turn
│   ├── ollama.ts          # streamChat(), listModels(), healthCheck()
│   └── routes/
│       ├── stories.ts     # Story CRUD + AI field generation + POST /stories/parse-text
│       ├── characters.ts  # Character CRUD + AI generation
│       ├── locations.ts   # Location CRUD + AI generation
│       ├── character-memories.ts  # Character memory CRUD + GET .../memories/chain
│       ├── chats.ts       # Chat + turn management, message streaming, state
│       ├── ollama.ts      # Health + model list endpoints
│       └── settings.ts    # App settings endpoints
└── frontend/src/
    ├── App.tsx            # Root — renders AppLayout
    ├── lib/
    │   ├── api.ts         # Typed fetch wrapper for every backend endpoint
    │   └── stream.ts      # NDJSON stream reader (handles all frame types)
    ├── store/
    │   ├── stories.ts     # Zustand: stories, characters, locations
    │   ├── chats.ts       # Zustand: chats, turns, streaming, lastStateUpdate
    │   └── settings.ts    # Zustand: appSettings, generation config, Ollama health
    └── components/
        ├── layout/
        │   ├── AppLayout.tsx     # Three-column layout shell
        │   ├── LeftPanel.tsx     # Stories, chats, characters, locations sidebar
        │   └── RightPanel.tsx    # Generation controls, mood, debug panel
        └── story/
            ├── CharacterModal.tsx
            ├── LocationModal.tsx
            ├── EditStoryModal.tsx
            ├── StoryCreateModal.tsx
            └── SettingsModal.tsx
        └── chat/
            ├── ChatWindow.tsx    # Message list + state update toast
            ├── ChatComposer.tsx  # Message input
            └── ChatMessage.tsx
```

---

## Development

```bash
npm run dev          # Start both backend (port 3001) and frontend (port 5173) concurrently
npm run build        # Build all packages in dependency order
npm run lint         # Biome check
npm run format       # Biome format --write

# Type-check only (no emit):
npx tsc --project backend/tsconfig.json --noEmit
npx tsc --project frontend/tsconfig.json --noEmit
```

Backend auto-restarts via `tsx watch`. Frontend uses Vite HMR. The Vite dev server proxies `/stories`, `/chats`, `/ollama`, `/settings`, `/health` to `http://127.0.0.1:3001`.

---

## Data Layer

### File Layout Per Story

```
data/
└── settings.json
└── stories/
    └── {storyId}/
        ├── story.json
        ├── characters.json          # Character[]
        ├── locations.json           # Location[]
        ├── chats/
        │   ├── {chatId}.meta.json   # Chat metadata
        │   └── {chatId}.jsonl       # Turn log (append-only, one JSON per line)
        ├── memory/
        │   └── {chatId}-items.json  # Chat-level MemoryItem[] (legacy system)
        ├── character-memories/
        │   └── {charId}.json        # CharacterMemory[] per character
        ├── state/
        │   └── {chatId}.json        # ChatEntityState (current location + overrides)
        └── summaries/               # Reserved for future use
```

### Entity Types

All types live in `packages/types/src/` and are validated with Zod at read time.

| Entity | Schema | Key Fields |
|---|---|---|
| `Story` | `StorySchema` | title, premise, genres, tone, rules, writingStyle, pov, systemPromptOverride |
| `Character` | `CharacterSchema` | name, role, isUserPersona, isNarrator, modelOverride, public{}, private{}, relationships[] |
| `Location` | `LocationSchema` | name, description, layout, lighting, atmosphere, soundscape, smells, notes, tags[] |
| `CharacterMemory` | `CharacterMemorySchema` | characterId, summary, tags[], importance (0–1), sourceChatId?, sourceTurnId?, **previousMemoryId?** (chain link), **branchLabel?**, **deltas?** (CharacterDelta) |
| `CharacterDelta` | `CharacterDeltaSchema` | personality{add,remove}, fears{add,remove}, privateKnowledge{add,remove}, speechStyle?, trueMotives?, hiddenEmotionalState?, moralLimits?, appearance?, clothing?, reputation? |
| `ChatEntityState` | `ChatEntityStateSchema` | currentLocationId, locationOverrides{locationId → partial overrides} |
| `Chat` | `ChatSchema` | storyId, mode (interactive\|storyteller), activeSpeakers[], title, **memoryAnchors?** ({charId → memoryId}) |
| `Turn` | `TurnSchema` | chatId, speaker (userId\|narratorId\|characterId), role (user\|assistant), text |
| `MemoryItem` | `MemoryItemSchema` | storyId, chatId, content, visibility, tags[], importance, revealed *(chat-level, legacy)* |
| `AppSettings` | `AppSettingsSchema` | ollamaEndpoint, activeModel, dataDir, theme, globalNote |

### Storage Module (`storage.ts`)

Every entity has a dedicated CRUD block. The module is the **only** place that touches the filesystem. Routes import from `storage`, never read/write files directly.

**Pattern used for every entity:**
```ts
// List
export async function listFoos(storyId: string): Promise<Foo[]>
// Get single
export async function getFoo(storyId: string, fooId: string): Promise<Foo | null>
// Create
export async function createFoo(storyId: string, data: FooCreate): Promise<Foo>
// Update (full merge, preserves id/storyId/createdAt)
export async function updateFoo(storyId: string, fooId: string, data: FooUpdate): Promise<Foo | null>
// Delete (returns true if found)
export async function deleteFoo(storyId: string, fooId: string): Promise<boolean>
```

---

## Backend: Request Flow

```
HTTP request
  → Fastify route handler
  → storage.* for data loading
  → resolveAccessibleMemories() → memory chain from anchor
  → findRelevantMemories(accessibleMemories, ...) → relevant subset
  → applyMemoryChain(base, chain) → effective character state
  → assembleContext({ effectiveCharacters, ... }) → OllamaMessage[]
  → streamChat() → NDJSON stream to client
  → storage.appendTurn() to persist
  → [if locations exist] runExtraction() → storage.updateChatState()
  → stateUpdate frame → done frame
```

### LLM Calls (`ollama.ts`)

`streamChat(opts)` — streams from Ollama `/api/chat`. Returns the full accumulated text. All LLM calls go through this function. Default params: temperature 0.85, top_p 0.9, top_k 40, repeat_penalty 1.1.

**Three types of LLM calls in the system:**
1. **Story generation** — AI generates genres, tone, rules, characters from a concept
2. **Chat response** — main roleplay response, full context, streaming to client
3. **Utility calls** (temperature 0.1, non-streaming via `onChunk` accumulator):
   - `memory-retrieval.ts` — relevance scoring
   - `extraction.ts` — entity state detection

---

## Context Assembly (`context.ts`)

`assembleContext(opts: AssembleOptions): OllamaMessage[]` builds the full system prompt and converts turns into the Ollama message array.

### Section Builders (pure functions, return `string | ''`):

| Function | Injects |
|---|---|
| `buildSpeakerInstructions(mode, speaker, userPersonas, otherChars)` | Role instructions, character voice, persona boundary |
| `buildStoryBlock(story, characters)` | Premise, tone, world rules, writing style |
| `buildPersonasBlock(userPersonas)` | Player character descriptions |
| `buildOtherCharsBlock(otherChars)` | Supporting character descriptions |
| `buildLocationBlock(location, overrides?)` | Current location with any state overrides applied |
| `buildCharacterMemoriesBlock(characterName, memories)` | Relevant memories for active speaker |
| `buildMoodBlock(moodTags)` | Per-tag writing directives |

Assembly order in `assembleContext`:
1. Speaker instructions (or `systemPromptOverride` if set on story)
2. Story block
3. Player personas
4. Other characters
5. Current location (if set in `ChatEntityState`)
6. Character memories (if any were retrieved)
7. Mood block
8. Response length instruction
9. Feel text (author style note)
10. Global note (from AppSettings)

**To add new context to the prompt:** write a new builder function, add its output field to `AssembleOptions`, call it in `assembleContext` at the appropriate priority position.

---

## Stream Protocol

All streaming endpoints (`/message`, `/regenerate`, `/opener`) write NDJSON to the response. Each line is a JSON object:

| Frame | Fields | When |
|---|---|---|
| Debug | `{ debug: { systemPrompt, model } }` | First frame, always |
| Content | `{ content: "..." }` | Each token chunk |
| State update | `{ stateUpdate: { currentLocationId, locationName } }` | After extraction detects a change |
| Error | `{ error: "..." }` | On failure (terminates stream) |
| Done | `{ done: true }` | Last frame (terminates stream) |

Frontend `stream.ts:readStream()` handles all frame types. To add a new frame type: add a case in `readStream`, add an `on<FrameName>` callback to `StreamOptions`, wire it through `sendMessageStream`/`regenerateStream`.

---

## Memory Retrieval (`memory-retrieval.ts`)

`findRelevantMemories(memories, recentTurns, maxResults=5): Promise<CharacterMemory[]>`

1. **Always include** memories with `importance >= 0.8`
2. **Tag pass** — extract keywords from last 5 turns; score memories by tag overlap; keep any with score ≥ 1
3. **LLM fallback** — if combined results < `maxResults`, ask LLM to identify additional relevant memories from the remaining pool
4. Returns up to `maxResults` memories, deduped

Called in `chats.ts` before `assembleContext`, with only the **accessible chain** of memories (not all memories). The caller (`resolveAccessibleMemories`) pre-filters to the chain before passing to this function.

---

## Memory Timeline (`storage.ts` + `character-state.ts`)

### Memory chain

`CharacterMemory` records form a linked list via `previousMemoryId`. The chain grows forward as new memories are created (auto-linked to the current head). Multiple branches can exist.

**Storage functions:**
- `getMemoryChain(storyId, charId, fromMemoryId)` — traverse backwards from `fromMemoryId` via `previousMemoryId`, return `[root → ... → from]` oldest-first
- `getMemoryHeads(storyId, charId)` — return memories whose `id` is NOT referenced as `previousMemoryId` by any other memory (leaf ends = possible current heads)
- `addCharacterMemory(...)` — if no `previousMemoryId` given, auto-links to the current natural head (most recently created head)

**Memory anchors on Chat** (`memoryAnchors: Record<string, string>`) — when starting a chat, an anchor can be set per character specifying which memory to start from. The accessible chain is everything traceable backwards from that anchor. If no anchor is set, the natural head is used.

**`resolveAccessibleMemories()`** (helper in `chats.ts`) — takes all memories + anchor map, returns the accessible chain plus any memories created within the current chat session.

### Character state deltas

`CharacterDelta` on a memory specifies trait changes that happened at that point in time:
- `personality.add/remove`, `fears.add/remove`, `privateKnowledge.add/remove` — array mutations
- String overrides: `speechStyle`, `trueMotives`, `hiddenEmotionalState`, `moralLimits`, `appearance`, `clothing`, `reputation` — `undefined` means no change, any string (including `''`) replaces the current value

**`applyMemoryChain(base, chain): Character`** (`character-state.ts`) — deep-clones the base character, iterates the chain oldest→newest, applies each memory's deltas. Returns the **effective** character state. The base character in storage is never mutated.

Context assembly uses `effectiveCharacters` instead of `characters` for the active speaker, so the system prompt reflects accumulated experiences.

---

## Entity Extraction (`extraction.ts`)

`runExtraction(ctx: ExtractionContext): Promise<ChatEntityState>`

**Registry pattern** — `extractors: EntityExtractor[]` contains all active extractors. To add a new extractor:
1. Implement `EntityExtractor` interface: `{ type: string; extract(ctx): Promise<Partial<ExtractionResult>> }`
2. Add it to the `extractors` array

**Current extractors:**
- `locationExtractor` — single LLM call (temp 0.1) analyzing last 4 turns; detects location changes and state overrides (lighting, atmosphere, soundscape, smells, description)

`ExtractionResult` shape:
```ts
{
  currentLocationId?: string | null   // new location or null to clear
  locationOverrides?: Record<string, LocationOverride>  // merged into existing overrides
}
```

Extraction runs **after** the full AI response is persisted, before the stream closes. Not run if the story has no locations. Failures are silently swallowed (non-fatal).

---

## Frontend Architecture

### Three-Column Layout

```
LeftPanel          ChatWindow         RightPanel
──────────         ──────────         ──────────
Stories list       Message history    Model selector
Chats list         State toast        Mode toggle
Personas           Error bar          Active speakers
Characters         Composer           Response length
Locations                             Mood tags
Settings btn                          Style note
                                      Advanced params
                                      Debug panel
```

### Stores (Zustand)

**`useStoriesStore`** — source of truth for story-scoped entities
- `stories`, `selectedStoryId`, `characters`, `locations`
- Populates `characters` and `locations` on `selectStory()`

**`useChatsStore`** — source of truth for active chat session
- `chats`, `activeChatId`, `activeStoryId`, `turns`
- `isStreaming`, `streamingText`, `abortController`
- `debugInfo` — last system prompt + model (from debug frame)
- `lastStateUpdate` — most recent `stateUpdate` frame (triggers toast)

**`useSettingsStore`** — app-wide settings + generation config
- `appSettings` (persisted to backend)
- `generation` (in-memory: moodTags, responseLength, feelText, temperature, top_p, top_k, repeat_penalty, model)
- `ollamaHealthy`, `availableModels`

### API Client (`lib/api.ts`)

Namespaced fetch wrapper. Every backend endpoint has a typed method. Add new endpoints here when adding new routes. Shape:
```ts
api.namespace.method(params): Promise<TypedResponse>
```

Namespaces: `stories`, `characters`, `locations`, `characterMemories`, `chatState`, `chats`, `settings`, `ollama`

Key additions in Round 2:
- `api.stories.parseText(text)` — import a story from pasted notes (returns same shape as `generateFields` + `locations[]`)
- `api.characterMemories.chain(storyId, charId, from?)` — fetch the accessible chain from an anchor point

---

## How to Add a New Entity Type

Follow this checklist exactly. Every step is required.

**1. Type** — `packages/types/src/{entity}.ts`
- Define `EntitySchema`, `EntityCreateSchema`, `EntityUpdateSchema`
- Export `type Entity`, `type EntityCreate`, `type EntityUpdate`
- Add export to `packages/types/src/index.ts`

**2. Storage** — `backend/src/storage.ts`
- Add `list/get/create/update/delete` functions
- Store in `{storyDir}/{entities}.json` (array) or `{storyDir}/{entities}/{id}.json` (per-parent)
- Update `createStory()` to initialize the new file/directory

**3. Route file** — `backend/src/routes/{entities}.ts`
- CRUD endpoints under `/stories/:id/{entities}`
- Optional: AI generation endpoint `POST /stories/:id/{entities}/generate-fields`
- Import `{Entity}CreateSchema`, `{Entity}UpdateSchema` from `@simplechat/types`

**4. Register** — `backend/src/index.ts`
- Import and `await app.register(entityRoutes)`

**5. Context** (if entity contributes to the system prompt)
- Add a `build{Entity}Block()` builder function in `context.ts`
- Add the field to `AssembleOptions`
- Call it in `assembleContext()` at the right priority
- Load and pass data in `chats.ts` message handler

**6. API client** — `frontend/src/lib/api.ts`
- Add typed methods under a new namespace

**7. Store** — `frontend/src/store/stories.ts` (or new store if not story-scoped)
- Add state field, load action, CRUD actions
- Load in `selectStory()` if story-scoped

**8. UI** — `frontend/src/components/story/{Entity}Modal.tsx`
- Follow `LocationModal.tsx` as the template
- Add section to `LeftPanel.tsx` with list + edit/delete actions
- Add modal to LeftPanel's modal section

**9. Verify**
```bash
npx tsc --project backend/tsconfig.json --noEmit
npx tsc --project frontend/tsconfig.json --noEmit
```

---

## Code Conventions

**TypeScript** — strict mode, ESM, `.js` extensions in import paths (even for `.ts` files).

**Zod** — all data entering the system is `.parse()`d or `.safeParse()`d. Never trust raw JSON. Use `Schema.parse()` to construct objects so defaults are applied.

**No comments** unless the WHY is non-obvious. Identifiers document the WHAT.

**No fake/stub implementations.** Every endpoint does real work.

**Errors** — routes return `{ error: string }` with appropriate HTTP status. Storage functions return `null` (not found) or `false` (not found on delete) rather than throwing.

**Route handlers** — validate body with the schema, 400 on failure, 404 on missing entity.

**LLM JSON parsing** — always use `extractJson()` (strips code fences before parsing) when consuming LLM output as JSON.

**CSS** — CSS Modules only. No inline styles except for one-off layout overrides. Variables defined in `:root` in the global stylesheet.

**Preact** — use `preact/hooks`, not `react`. JSX uses `class=` not `className=`. Event handlers use `onInput` for text inputs (not `onChange`).

---

## Extraction Extender Guide

To detect a new kind of state change (e.g., character emotion, weather, time of day):

1. Add fields to `ChatEntityState` in `packages/types/src/chat-state.ts`
2. Add the new fields to `ExtractionResult` interface in `extraction.ts`
3. Write a new extractor implementing `EntityExtractor`:
   ```ts
   const myExtractor: EntityExtractor = {
     type: 'my-type',
     async extract(ctx): Promise<Partial<ExtractionResult>> {
       // One LLM call, temperature: 0.1, return JSON
       // Return {} on any failure — extraction must be non-fatal
     }
   }
   ```
4. Add it to the `extractors` array in `extraction.ts`
5. In `storage.ts` add update functions for the new state fields
6. In `chats.ts` merge the new state into `updateChatState()`
7. In `context.ts` add a builder for the new state and wire into `assembleContext()`

---

## Context Assembly Extender Guide

To inject new information into the LLM system prompt:

1. Write a pure builder function in `context.ts`:
   ```ts
   export function buildXxxBlock(data: Xxx): string {
     // Return '' if nothing to inject
   }
   ```
2. Add the corresponding field to `AssembleOptions`
3. Call it in `assembleContext()` at the correct position (entities before mood, mood before length)
4. Load the data before calling `assembleContext()` in `chats.ts` and pass it through

---

## Known Constraints & Gotchas

- **Ollama on Windows**: `localhost` resolves to `::1` (IPv6) but Ollama binds to `127.0.0.1`. The `ollamaEndpoint()` function normalises this automatically.
- **Settings cache**: `config.ts` caches settings in `_settings`. If settings change externally during a run, the cache won't update until restart.
- **Turns are append-only JSONL**: The turn log is never sorted or deduplicated. `deleteFromTurn` and `deleteAfterTurn` rewrite the full file.
- **Character file is a single array**: All characters in a story are stored in one `characters.json`. Fine for typical story sizes (< 50 characters).
- **Extraction is synchronous at stream end**: `runExtraction()` is awaited before the `done` frame is written. Keep extractor LLM calls cheap (temp 0.1, short prompts, `num_predict` if needed).
- **Memory retrieval is synchronous before response**: `findRelevantMemories()` runs before `assembleContext()`. If a character has many memories and the LLM fallback fires, this adds latency. Consider capping memories stored per character.
- **No authentication**: This is a local tool. No auth, no multi-user support.
