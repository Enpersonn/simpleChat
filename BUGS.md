# SimpleChat — Bug & Architectural Violation Registry

Audit conducted: 2026-04-23
Auditor: Claude Sonnet 4.6

---

## Table of Contents

- [Bugs & Issues](#bugs--issues)
  - [High Severity](#high-severity)
  - [Medium Severity](#medium-severity)
  - [Low Severity](#low-severity)
- [Architectural Violations](#architectural-violations)
  - [Clean Architecture](#clean-architecture-violations)
  - [DRY Violations](#dry-violations)
  - [SRP Violations](#srp-violations)

---

## Bugs & Issues

### High Severity

---

#### BUG-001 — Turn saved after stream closed (data loss window)

**Files:** `backend/src/routes/chats.ts` ~lines 455–468 (regenerate), ~lines 632–643 (opener)
**Severity:** High

The `regenerate` and `opener` handlers call `reply.raw.end()` to close the HTTP response stream, and then `await storage.appendTurn(...)` to persist the turn. If the process crashes, the disk is full, or `appendTurn` throws between those two points, the client receives a `done: true` frame with no error — but the turn is never saved. The turn log permanently diverges from what the client rendered.

The `message` handler (lines 250–325) does this correctly: it persists the turn *before* writing the `done` frame and closing the stream. The `regenerate` and `opener` handlers must follow the same order.

**Fix:** Move `storage.appendTurn()` and `storage.deleteSingleTurn()` (in regenerate) to *before* `reply.raw.end()`, following the pattern in the message handler.

---

#### BUG-002 — PATCH /state body not Zod-validated

**Files:** `backend/src/routes/chats.ts` ~line 97
**Severity:** High

The PATCH `/state` handler passes `req.body as never` directly to `storage.updateChatState` with no schema validation. Any malformed or malicious payload — wrong types, extra fields, missing required keys — goes directly to the storage layer and is written to disk, corrupting the `ChatEntityState` JSON.

`ChatEntityStateSchema` (or a `.partial()` of it) already exists in `@simplechat/types` and must be used to validate the body before passing to storage.

**Fix:** Add `const parsed = ChatEntityStateSchema.partial().safeParse(req.body)` at the top of the handler; return 400 on parse failure.

---

#### BUG-003 — POST /memory body not Zod-validated

**Files:** `backend/src/routes/chats.ts` ~line 703
**Severity:** High

The POST `/memory` route casts `req.body as never` and passes it directly to `storage.addMemoryItem`. No validation occurs. Missing fields (e.g., no `content`) or wrong types will produce a malformed `MemoryItem` record written to disk. No 400 error is returned on bad input.

`MemoryItemCreateSchema` exists in `@simplechat/types` and must be used here.

**Fix:** Validate `req.body` with `MemoryItemCreateSchema.safeParse(req.body)`; return 400 on failure.

---

### Medium Severity

---

#### BUG-004 — `storyDir()` creates directory on every call, including reads

**Files:** `backend/src/storage.ts` ~lines 41–44
**Severity:** Medium

`storyDir()` unconditionally calls `mkdir(dir, { recursive: true })` on every invocation, including read-only operations like `getStory`, `listCharacters`, `listChats`, etc. A request with a non-existent or malformed story ID will silently create an empty story directory on disk. `getStory` will return `null` after creating the empty directory, leaving orphaned directories that clutter the data folder and can confuse directory-existence checks elsewhere (e.g., `!existsSync(dir)` in `listChats` ~line 208 behaves unexpectedly when the dir exists but has no content files).

**Fix:** Either guard `mkdir` behind a write-only flag parameter, or split into `ensureStoryDir()` (called only in create operations) and `getStoryDir()` (pure path helper for reads).

---

#### BUG-005 — Settings singleton not safe under concurrent writes

**Files:** `backend/src/config.ts` ~line 9
**Severity:** Medium

`_settings` is a module-level singleton. `saveSettings` writes to disk then updates `_settings`. If two concurrent requests both call `saveSettings`, the second write may begin before the first finishes, resulting in interleaved writes. The last `writeFile` to complete wins on disk, but `_settings` in memory may reflect a different version. There is no locking or queuing mechanism.

**Fix:** Serialize writes through a promise queue (e.g., chain each write onto a module-level `writeQueue` promise) to guarantee sequential disk access.

---

#### BUG-006 — `addCharacterMemory` silently extends the wrong branch

**Files:** `backend/src/storage.ts` ~lines 420–446
**Severity:** Medium

When `previousMemoryId` is not provided and the character has multiple memory heads (branches), `addCharacterMemory` picks the most-recently-created head by creation timestamp. This is a silent heuristic with no user feedback. If a user has intentionally created two timeline branches, new memories will always extend the most-recently-touched one regardless of which context is active, potentially corrupting the intended branching structure without any error or warning.

**Fix:** When `previousMemoryId` is not provided and multiple heads exist, either require the caller to specify one explicitly (return a 409 or descriptive error), or expose the ambiguity to the route layer so it can be surfaced to the user.

---

#### BUG-007 — Chat-local memories appended out of order in `resolveAccessibleMemories`

**Files:** `backend/src/routes/chats.ts` ~lines 810–816
**Severity:** Medium

`resolveAccessibleMemories` resolves the chain (oldest → newest via `previousMemoryId` traversal) and then appends memories whose `sourceChatId === chatId` but which are not already in the chain using `chain.push(m)`. These are appended in arbitrary iteration order (object enumeration order of a flat array). If a chat-local memory was created before existing chain entries, it is appended *after* them, violating the oldest-to-newest ordering that `applyMemoryChain` relies on. This produces an incorrect effective character state where earlier events override later ones.

**Fix:** After collecting chat-local extras, sort the entire resulting array by `createdAt` before returning it to ensure correct ordering for `applyMemoryChain`.

---

#### BUG-008 — Narrator-mode chats never retrieve character memories

**Files:** `backend/src/routes/chats.ts` ~lines 150–151
**Severity:** Medium

When `chat.activeSpeakers` is empty, `activeSpeaker` is set to the string literal `"narrator"`. The subsequent `resolveCharacterChains` call does `characters.findIndex((c) => c.id === activeSpeaker)` which returns `-1` because no character has the id `"narrator"`. As a result, `accessibleMemories` is always `[]` in narrator-mode chats, and no memories are ever retrieved or injected into the system prompt. This silently degrades context quality without any error.

**Fix:** Handle the narrator case explicitly: either skip memory retrieval (narrator has no memories), or treat it as retrieving memories for all active speakers. Document which is intended.

---

#### BUG-009 — Streaming handlers bypass Fastify CORS with wildcard `*`

**Files:** `backend/src/routes/chats.ts` ~lines 219, 419–425, 593–599
**Severity:** Medium

All three streaming handlers (`message`, `regenerate`, `opener`) manually call `reply.raw.writeHead(200, { "Access-Control-Allow-Origin": "*", ... })`. This bypasses the Fastify CORS plugin configured in `backend/src/index.ts` (lines 15–18) which restricts origins to `http://localhost:5173` and `http://127.0.0.1:5173`. The wildcard `*` on streaming endpoints overrides the origin allowlist for the application's most sensitive endpoints.

**Fix:** Remove the manual CORS header from `writeHead` and instead use Fastify's CORS plugin for streaming responses, or explicitly mirror the same origin value configured in the plugin.

---

#### BUG-010 — `error` and `done` frames both sent; client may call both callbacks

**Files:** `backend/src/routes/chats.ts` ~lines 232–248; `frontend/src/lib/stream.ts` ~line 58
**Severity:** Medium

When `streamChat` throws, the server writes an `{ error: msg }` frame and then execution falls through to the code that always writes `{ done: true }` at the end of the handler. The client's `readStream` calls `onError(msg)` and immediately `return`s, never processing the `done` frame. However, on localhost both frames are frequently buffered into the same TCP packet. The `readStream` processes line by line; if it processes `done` before `return` takes effect (implementation-dependent), `onDone()` fires after `onError()` — leaving the UI believing the stream ended successfully despite the error.

**Fix:** On the server, `return` immediately after writing the `error` frame without writing `done`. On the client, treat `error` as a terminal frame (which it already does, but the server should match that contract).

---

#### BUG-011 — Floating promise on history refresh after stream completes

**Files:** `frontend/src/store/chats.ts` ~lines 143–155, 211–215, 271–276
**Severity:** Medium

Inside `sendMessage.onDone`, `regenerate.onDone`, and `editAndResend.onDone`, the call `api.chats.history(...).then(...)` is a floating promise with no `.catch()`. If the history fetch fails after a successful stream (transient network error, server restart), the unhandled promise rejection is silently swallowed. The UI state does not update: `isStreaming` may remain `true` or the turn list is not refreshed, leaving the interface in a permanently broken state for that session.

**Fix:** Add `.catch((err) => { set({ error: err.message }) })` to all three `onDone` history fetch calls, or wrap in `try/catch` inside an `async` callback.

---

#### BUG-012 — `memoryTimelineCutoff` may resolve an incomplete chain from a branched memory

**Files:** `backend/src/routes/chats.ts` ~lines 796–799
**Severity:** Medium

When `memoryTimelineCutoff` is set, the code selects the eligible memory with the latest `createdAt` timestamp and then calls `getMemoryChain(storyId, charId, selectedMemory.id)` to reconstruct the chain. `getMemoryChain` traverses *backwards* via `previousMemoryId` links. If the selected memory is on a branch (not the deepest/latest node in the main chain), the resulting chain will be shorter and may omit memories that should be accessible. The correct approach is to find the chain-head that is at or before the cutoff and is reachable in chain order.

**Fix:** Traverse the chain from the natural head backwards; stop at the first memory whose `createdAt` is at or before `memoryTimelineCutoff`. This ensures the correct chain depth rather than picking by timestamp across all memories regardless of chain position.

---

### Low Severity

---

#### BUG-013 — `deleteFromTurn` is dead code with misleading semantics

**Files:** `backend/src/storage.ts` ~lines 286–303
**Severity:** Low

`deleteFromTurn` (line 286) removes all turns from a given index *onwards* (keeps turns *before* the index). `deleteAfterTurn` (line 296) removes turns *after* the given index (keeps turns up to and *including* the index). The names suggest opposite semantics to what they implement. More critically, `deleteFromTurn` is never called by any route handler — only `deleteAfterTurn` and `deleteSingleTurn` are used. The dead function with confusing naming is a maintenance hazard: a future developer may call it believing it has the semantics of `deleteAfterTurn`.

**Fix:** Delete `deleteFromTurn` entirely (it is unreachable). If ever needed in future, re-add with a clearly distinguishing name.

---

#### BUG-014 — LLM output for `currentLocationId` not Zod-validated in extraction

**Files:** `backend/src/extraction.ts` ~line 82
**Severity:** Low

`locationExtractor` casts the parsed LLM JSON output to `as Record<string, unknown>` (line 74) and then checks `data.currentLocationId === 'null' || data.currentLocationId === ''` to handle the LLM returning the string `"null"`. If the LLM returns an integer, boolean, or object for `currentLocationId`, the `typeof data.currentLocationId === 'string'` guard (line 81) prevents the null-coercion branch, and the raw non-string value is passed to `storage.updateChatState`. No Zod schema validates the entire extraction output shape.

**Fix:** Define a Zod schema for the extractor's expected LLM JSON output and use `.safeParse()` on the raw parsed object before reading any fields. Return `{}` on parse failure (extraction must remain non-fatal).

---

#### BUG-015 — Silent error swallowing in CharacterModal API calls

**Files:** `frontend/src/components/story/CharacterModal.tsx` ~lines 119–122
**Severity:** Low

`CharacterModal` calls `api.characterMemories.chain(...)` and `api.characters.relationships(...)` directly inside the component with `.catch(() => {})` — swallowing all errors silently. If either call fails (network error, server down, invalid storyId), the modal renders with empty/stale data and no error message is shown to the user. The user has no way to know the data failed to load.

**Fix:** Replace the empty catch with state that tracks an error message and render it in the modal UI, or route these calls through store actions that handle errors centrally.

---

#### BUG-016 — `generateStoryMemories` called with `premise` for both `concept` and `premise`

**Files:** `frontend/src/components/story/StoryCreateModal.tsx` ~line 155
**Severity:** Low

`api.stories.generateStoryMemories(premise.trim(), premise.trim(), characters)` passes the same string for both the `concept` and `premise` parameters. The backend `generate-story-memories` handler uses `concept` in its LLM system prompt as the raw user input and `premise` as the refined world-premise — these are intended to be different. Passing `premise` as `concept` means the LLM prompt never receives the user's original concept draft, only the refined premise twice.

**Fix:** Pass the original user-entered concept text as the first argument and the generated/refined premise as the second.

---

#### BUG-017 — `editAndResend` reads `lastAsst` from stale pre-deletion turn state

**Files:** `frontend/src/store/chats.ts` ~lines 224–228
**Severity:** Low

`editAndResend` calls `deleteAfterTurn` on the server (line 229) which removes turns after the edited one. Immediately before or after this, it reads `const lastAsst = [...turns].reverse().find((t) => t.role === 'assistant')` from the local `turns` state which has not yet been updated to reflect the deletion. The `lastAsst` found may be a turn that no longer exists server-side. The turn's `speaker` value is used to set `streamingPlaceholder.speaker`. While this is cosmetic, it represents stale-state logic that could produce incorrect speaker assignment if the deletion removes the most recent assistant turn.

**Fix:** Capture `lastAsst` before calling `deleteAfterTurn`, or re-derive it from the turns that will remain after deletion (i.e., turns up to and including the edited turn index).

---

#### BUG-018 — Variable shadowing of `base` parameter in `applyMemoryChain`

**Files:** `backend/src/character-state.ts` ~line 93
**Severity:** Low

Inside the `d.relationships` loop within `applyMemoryChain`, a `const base = ...` declaration shadows the outer `base` parameter (the original character object). The code compiles and functions correctly, but a future developer could accidentally use the inner `base` believing it refers to the full character, leading to subtle bugs. This is particularly risky since the function's core contract is to not mutate the outer `base`.

**Fix:** Rename the inner variable to `existingRel` or `currentRel` to avoid shadowing.

---

#### BUG-019 — Head-finding logic duplicated in characters route diverges from storage

**Files:** `backend/src/routes/characters.ts` ~lines 110–119; `backend/src/storage.ts` (private `getHeadsFromList`)
**Severity:** Low

The `/relationships` endpoint in `routes/characters.ts` re-implements the memory head-finding algorithm (a memory is a "head" if its `id` is not referenced as `previousMemoryId` by any other memory) rather than calling `storage.getMemoryHeads`. If the algorithm in storage is updated (e.g., to handle edge cases), the duplicate in the route will silently diverge and produce different results.

**Fix:** Export `getMemoryHeads` from `storage.ts` (it may already exist) and call it from the characters route instead of re-implementing the logic.

---

#### BUG-020 — Memory normalization block copy-pasted verbatim across two story routes

**Files:** `backend/src/routes/stories.ts` ~lines 476–546 and ~lines 757–826
**Severity:** Low

The ~70-line block that processes `rawDeltas`, extracts `relationshipEffects`, strips `relationships` from deltas, and maps the final memory shape is copied verbatim between the `generate-story-memories` handler and the `parse-story-memories` handler. A bug fix or schema change applied to one copy will silently fail to apply to the other, causing the two code paths to diverge in behaviour.

**Fix:** Extract this normalization into a shared function (e.g., `normaliseMemoryDeltas(raw)`) called by both handlers.

---

## Architectural Violations

### Clean Architecture Violations

---

#### ARCH-001 — Modal components call `api.*` directly, bypassing the store layer

**Files:**
- `frontend/src/components/story/CharacterModal.tsx` ~lines 119–122, 214–229, 241–243
- `frontend/src/components/story/LocationModal.tsx` ~lines 38–52
- `frontend/src/components/story/EditStoryModal.tsx` ~lines 49–53
- `frontend/src/components/story/SettingsModal.tsx` ~lines 31–44

**Principle violated:** Clean Architecture — components should not touch the API layer directly.

Multiple modal components call `api.*` methods directly rather than routing through store actions. This violates the layering rule that all API calls go through the store, which is the single place responsible for loading state, error handling, and cache invalidation. Specific violations:

- `CharacterModal` calls `api.characterMemories.chain`, `api.characters.relationships`, `api.characterMemories.update`, `api.characterMemories.create`, `api.characterMemories.delete` directly
- `LocationModal` calls `api.locations.generateFields` directly
- `EditStoryModal` calls `api.stories.generateSupporting` directly
- `SettingsModal` calls `api.settings.update`, `api.ollama.health`, and `api.ollama.models` directly, partially duplicating logic already in `useSettingsStore.saveSettings`

**Correct approach:** Each of these operations should be a store action. The component calls the store action; the store handles the API call, sets loading state, and handles errors.

---

#### ARCH-002 — Domain business logic lives inside route files

**Files:** `backend/src/routes/chats.ts` ~lines 713–817

**Principle violated:** Clean Architecture — routes handle HTTP; domain logic belongs in service modules.

`resolveCharacterChains`, `generateLocationFromContext`, and `resolveAccessibleMemories` are significant domain functions defined at module scope inside a route file. They have nothing to do with HTTP request/response handling. Being inside a route file makes them untestable in isolation, invisible to other backend modules that might need them, and mixed with HTTP concerns.

**Correct approach:** Move these to dedicated service/domain modules:
- `resolveAccessibleMemories` → `backend/src/character-memory-service.ts`
- `resolveCharacterChains` → same module
- `generateLocationFromContext` → `backend/src/location-service.ts`

---

#### ARCH-003 — Canon timeline route body not Zod-validated

**Files:** `backend/src/routes/canon-timeline.ts` ~lines 15–17

**Principle violated:** Clean Architecture — all data entering the system at HTTP boundaries must be validated.

The `addEntry` endpoint casts `req.body` to a partial type without using Zod. `CanonEntryCreateSchema` exists in `@simplechat/types` and should be used. This is the same class of violation as BUG-002 and BUG-003.

**Correct approach:** Use `CanonEntryCreateSchema.safeParse(req.body)` and return 400 on failure.

---

#### ARCH-004 — Private storage helper re-implemented inline in route

**Files:** `backend/src/routes/characters.ts` ~lines 110–113; `backend/src/storage.ts` (unexported `getHeadsFromList`)

**Principle violated:** Clean Architecture — encapsulation; single source of truth for storage logic.

`getHeadsFromList` in `storage.ts` is not exported. The characters route re-implements the same head-finding logic inline rather than calling the storage function. Storage internals should be encapsulated; routes that need this behaviour should call the public `getMemoryHeads` storage function.

**Correct approach:** Export `getMemoryHeads` (or `getHeadsFromList`) from `storage.ts` and call it from the characters route. Delete the inline re-implementation.

---

#### ARCH-005 — Global DOM mutations duplicated between SettingsModal and AppLayout

**Files:** `frontend/src/components/story/SettingsModal.tsx` ~lines 14–20; `frontend/src/components/layout/AppLayout.tsx` ~lines 25–32

**Principle violated:** Clean Architecture / SRP — DOM side-effects belong in one place.

`SettingsModal` directly calls `document.documentElement.setAttribute('data-theme', theme)` and `document.documentElement.style.setProperty('--bubble-font-size', ...)` in two `useEffect` hooks to preview settings changes. The same mutations are performed in `AppLayout`. Two separate effects now own the same global DOM state. If they are triggered at different points in the render cycle, they can produce visual flickering or fight each other. The concern of applying global theme state belongs in exactly one place.

**Correct approach:** Extract theme and font-size application into a `useTheme(theme, fontSize)` hook. Use that hook in `AppLayout` only. `SettingsModal` stores the pending value in component state; `AppLayout` applies it reactively when the store value changes.

---

### DRY Violations

---

#### DRY-001 — Memory normalization block copy-pasted across two handlers

**Files:** `backend/src/routes/stories.ts` ~lines 476–546 and ~lines 757–826

The ~70-line block that normalizes raw memory deltas (processes `rawDeltas`, extracts `relationshipEffects`, strips `relationships` from deltas, maps the final memory shape) is identical across `generate-story-memories` and `parse-story-memories`. Also tracked as BUG-020.

**Correct approach:** Extract into `normaliseMemoryDeltas(rawMemories)` called by both handlers.

---

#### DRY-002 — Genre and tone option lists defined in three separate places

**Files:**
- `backend/src/routes/stories.ts` ~lines 83–104 (`STORY_GENRES`, `STORY_TONES`)
- `frontend/src/components/story/StoryCreateModal.tsx` ~lines 8–9 (`GENRE_OPTIONS`, `TONE_OPTIONS`)
- `frontend/src/components/story/EditStoryModal.tsx` ~lines 8–9 (`GENRE_OPTIONS`, `TONE_OPTIONS`)

The same list of story genres and tones is maintained independently in the backend (used in LLM prompts) and in two frontend components (used in select dropdowns). Any new genre added to the backend prompt that is not added to the frontend dropdowns (or vice versa) will cause silent inconsistency.

**Correct approach:** Define `STORY_GENRES` and `STORY_TONES` once in `packages/types/src/story.ts` (or a new `packages/types/src/constants.ts`) and import them in all three locations.

---

#### DRY-003 — `assembleContext` setup duplicated across three stream handlers

**Files:** `backend/src/routes/chats.ts` ~lines 197–211, 402–417, 558–573

The ~30-line block that resolves `currentLocation`, `locationOverrides`, `otherCharMemories`, loads `globalNote` from settings, and calls `assembleContext(...)` is copy-pasted nearly identically across the `message`, `regenerate`, and `opener` handlers. Differences between the copies are minimal and easy to miss, creating a divergence risk.

**Correct approach:** Extract into `buildContextForChat(chat, characters, turns, state, settings, memories): Promise<OllamaMessage[]>` and call it from all three handlers.

---

#### DRY-004 — Streaming response setup duplicated across three handlers

**Files:** `backend/src/routes/chats.ts` ~lines 214–230, 419–435, 592–612

The block that calls `reply.raw.writeHead(200, { "Content-Type": "application/x-ndjson", ... })` and writes the initial debug frame is copy-pasted across the `message`, `regenerate`, and `opener` streaming handlers.

**Correct approach:** Extract into `startNdjsonStream(reply: FastifyReply, debugInfo: DebugInfo): void`.

---

#### DRY-005 — Array field extraction pattern repeated 5+ times in stories route

**Files:** `backend/src/routes/stories.ts` (multiple locations across generate-fields, generate-story-core, parse-story-core, generate-supporting, parse-text handlers)

The pattern:
```ts
genres: Array.isArray(data.genres)
  ? data.genres.filter((x): x is string => typeof x === 'string')
  : [],
tone: Array.isArray(data.tone)
  ? data.tone.filter((x): x is string => typeof x === 'string')
  : [],
...
```
appears at least 5 times, extracting the same set of story core fields from different raw LLM response objects.

**Correct approach:** Extract into `extractStoryCoreFields(data: unknown): Partial<StoryCoreFields>` and call it once per handler.

---

#### DRY-006 — Dynamic `import('../ollama.js')` + chunk accumulator repeated in 12+ handlers

**Files:** `backend/src/routes/stories.ts`, `backend/src/routes/characters.ts`, `backend/src/routes/locations.ts`, `backend/src/routes/chats.ts` (multiple handlers each)

Every AI generation route uses:
```ts
const { streamChat } = await import('../ollama.js')
let raw = ''
await streamChat({ ..., onChunk: (text) => { raw += text } })
```
This dynamic import is unnecessary — `streamChat` is a static module export. The chunk accumulation pattern is identical across every non-streaming LLM call. This boilerplate appears in at minimum 12 route handlers.

**Correct approach:** Export a `runLLM(messages, opts): Promise<string>` helper from `ollama.ts` (or a `llm.ts` utility) that accumulates and returns the full text. Route handlers call `runLLM(...)` instead of managing the accumulator themselves. Import `streamChat` statically at the top of each route file that needs it.

---

#### DRY-007 — Stream `onChunk`/`onDone`/`onError` callbacks duplicated in frontend store

**Files:** `frontend/src/store/chats.ts` ~lines 134–165, 201–222, 260–284

The streaming callback objects passed to `sendMessageStream`, `regenerateStream`, and `editAndResend` (which calls `sendMessageStream` internally) are nearly identical:
- `onChunk`: appends to `streamingText`, updates placeholder turn
- `onDone`: fetches history, resets streaming state, clears `streamingText`
- `onError`: resets streaming state, sets error message

The implementations are copy-pasted with only minor differences (which turns to delete, which placeholder to use). A bug fix in one is silently missing from the others.

**Correct approach:** Extract into `buildStreamHandlers(set, get, opts): StreamOptions` factory that returns the callback object, parameterized on the parts that differ.

---

#### DRY-008 — `handleDraft` and `handleParse` are identical 4-step pipelines

**Files:** `frontend/src/components/story/StoryCreateModal.tsx` ~lines 125–179, 182–233

Both `handleDraft` and `handleParse` follow the same 4-step structure: (1) generate/parse core, (2) generate/parse characters, (3) generate/parse locations, (4) generate/parse memories. Both use the same state variables (`setGenStep`, `setLivePreview`, `setPendingMemories`), the same error pattern, and the same step index tracking. The only differences are which API calls are made at each step.

**Correct approach:** Extract into `runCreationPipeline(steps: PipelineStep[]): Promise<void>` where each step is a typed object with a label and an async `run()` function. Both `handleDraft` and `handleParse` call `runCreationPipeline` with different step arrays.

---

#### DRY-009 — Legacy monolithic endpoints kept alongside multi-step equivalents

**Files:** `backend/src/routes/stories.ts` (routes `/generate-fields` ~lines 107–188 and `/parse-text` ~lines 883–977)

Two legacy "do everything in one call" endpoints exist alongside the multi-step pipeline endpoints (`/generate-story-core`, `/generate-story-characters`, `/generate-story-locations`, `/generate-story-memories`). The legacy endpoints contain large LLM system prompts, JSON extraction logic, and field normalization code that overlap significantly with the multi-step equivalents. Any prompt engineering improvement made to the multi-step flow must be manually mirrored in the legacy endpoints.

**Correct approach:** Deprecate and remove `/generate-fields` and `/parse-text` if the multi-step pipeline is the canonical flow. If they must be kept for backwards compatibility, internally compose them by calling the same service functions used by the multi-step routes rather than duplicating the logic.

---

#### DRY-010 — Character normalization uses different mechanisms in stories vs characters route

**Files:** `backend/src/routes/stories.ts` ~lines 6–81 (`normaliseCharacter`, `parseCharactersArray`); `backend/src/routes/characters.ts` ~lines 156–176

Both routes convert raw LLM character output to a typed `Character`-shaped object. The stories route uses manual type-narrowing with a `normaliseCharacter` function. The characters route uses Zod schema parsing. The two approaches can produce differently-shaped objects from the same LLM output (e.g., different defaults for missing fields), meaning a character generated in a story context may have different field defaults than one generated via the characters route.

**Correct approach:** Define a single `parseLLMCharacter(raw: unknown): CharacterCreate` utility in a shared module that uses Zod with `.catch()` defaults, and call it from both routes.

---

### SRP Violations

---

#### SRP-001 — `config.ts` has three unrelated concerns

**Files:** `backend/src/config.ts`

`config.ts` is responsible for:
1. Server infrastructure constants (`PORT`, `HOST`)
2. Application settings persistence (`getSettings`, `saveSettings`, `_settings` singleton)
3. Data directory path computation (`dataDir()`)

These are three independent concerns. The file that defines which port the server listens on has no business managing the user's story data directory or caching application settings.

**Correct approach:**
- Move `PORT` and `HOST` to `backend/src/index.ts` or an `env.ts` file
- Move `getSettings`/`saveSettings`/`_settings` to `backend/src/settings-service.ts`
- Move `dataDir()` to `backend/src/storage.ts` (it is only used there) or a `paths.ts` utility

---

#### SRP-002 — `routes/stories.ts` handles 8+ distinct concerns (1100+ lines)

**Files:** `backend/src/routes/stories.ts`

This single route file is responsible for:
1. Story CRUD (create, read, update, delete)
2. Monolithic AI field generation (`/generate-fields`)
3. Multi-step AI generation pipeline (core, characters, locations, memories)
4. Multi-step AI parsing pipeline (`/parse-story-core`, `/parse-story-characters`, etc.)
5. Text import and free-text parsing (`/parse-text`)
6. Supporting field regeneration (`/generate-supporting`)
7. LLM output normalization helpers (`normaliseCharacter`, `normaliseLocation`, etc.)
8. Memory delta normalization

At 1100+ lines handling 8 distinct concerns, this file is impossible to navigate and extremely difficult to maintain or extend.

**Correct approach:** Split into:
- `routes/stories.ts` — CRUD only
- `routes/story-generation.ts` — AI generation pipeline (all `/generate-*` and `/parse-*` endpoints)
- `backend/src/story-normalizers.ts` — shared normalization utilities used by generation routes

---

#### SRP-003 — `useChatsStore` mixes three concerns: data, streaming UI, and orchestration

**Files:** `frontend/src/store/chats.ts`

The chats Zustand store manages:
1. **Data state:** `turns`, `chats`, `activeChatId`, `activeStoryId`
2. **Streaming UI state:** `isStreaming`, `streamingText`, `abortController`
3. **Orchestration logic:** `sendMessage`, `regenerate`, `editAndResend` — full stream setup, teardown, and history refresh

These are distinct concerns. Mixing them means any change to how streaming works (e.g., adding a new callback) touches the same file as data loading and chat selection logic.

**Correct approach:** Either split into separate slices (`useChatDataStore`, `useChatStreamStore`) or at minimum extract the orchestration logic into a `chat-stream-service.ts` module with the store only storing state and exposing simple setters.

---

#### SRP-004 — `buildSpeakerInstructions` mixes four distinct prompt concerns

**Files:** `backend/src/context.ts` ~lines 47–139

`buildSpeakerInstructions` is a 92-line function that builds a combined string from:
1. Character identity and voice instructions
2. Memory history formatting
3. Multi-character awareness and turn management rules
4. Response formatting rules and length guidance

Each of these is a distinct prompt section with its own logic. Combining them in one function makes it hard to adjust any one section without understanding the full function, and makes reordering prompt sections require rewriting the function.

**Correct approach:** Split into four sub-builders:
- `buildCharacterVoiceBlock(character)` — identity and voice
- `buildMemoryContextBlock(memories)` — memory formatting (currently partly in `buildCharacterMemoriesBlock` but also partially here)
- `buildMultiCharacterBlock(chars)` — awareness instructions
- `buildResponseRulesBlock(mode)` — formatting rules

`buildSpeakerInstructions` becomes a thin compositor that calls these four functions.

---

## Summary

| Category | Count |
|----------|-------|
| High severity bugs | 3 |
| Medium severity bugs | 9 |
| Low severity bugs | 8 |
| **Total bugs** | **20** |
| Clean Architecture violations | 5 |
| DRY violations | 10 |
| SRP violations | 4 |
| **Total architectural violations** | **19** |
| **Grand total** | **39** |
