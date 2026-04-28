# SimpleChat — AI Agent Layer Refactor Mandate

**Status:** Approved for implementation  
**Scope:** Backend AI generation and parsing subsystems only  
**Author:** Architecture review, 2026-04-28

---

## The Problem

Open any of these files and look at the LLM-backed endpoint handlers:
- `backend/src/routes/stories.ts` — 9 AI endpoints
- `backend/src/routes/characters.ts` — 1 AI endpoint
- `backend/src/routes/locations.ts` — 1 AI endpoint

Every single one is the same 20-line block:

```ts
const { streamChat } = await import("../ollama.js")
const systemPrompt = ["You are a...", "Return ONLY valid JSON...", "..."].join("\n")
let raw = ""
await streamChat({ messages: [...], temperature: X, onChunk: (t) => { raw += t } })
try {
  const data = extractJson(raw) as Record<string, unknown>
  return {
    name: typeof data.name === "string" ? data.name : "",
    role: typeof data.role === "string" ? data.role : "",
    // ... 10 more lines of manual coercion ...
  }
} catch {
  return reply.status(422).send({ error: "LLM did not return valid JSON", raw })
}
```

The normaliser functions (`normaliseCharacter`, `normaliseLocation`, etc.) are defined once in `stories.ts` and then re-implemented inline wherever else they are needed.

**Concrete consequences of this today:**
- A bug in `extractJson` error handling must be fixed in 11 places
- Adding a new entity type (e.g. "prop", "faction", "weather state") means copying this scaffold into at least 3 files
- There is no test seam — you cannot verify prompt content or response normalisation without making real HTTP + LLM calls
- The system prompt for character generation exists in three slightly different versions with no single source of truth

This is not complexity that serves the product. It is accidental complexity from a lack of abstraction.

---

## The Architecture

### New File Tree

```
backend/src/
  llm-agent.ts                  ← owns the LLM call/parse cycle
  normalizers.ts                ← all entity coercion in one place
  generation/
    agents.ts                   ← pre-configured LLMAgent singletons
    service.ts                  ← generateSingle() + generateList()
  parsing/
    agents.ts                   ← pre-configured parse agent singletons
    sanitize.ts                 ← sanitizeTextForParsing() — pure function
    service.ts                  ← parseEntities()
  routes/
    ai.ts                       ← POST /ai/generate  +  POST /ai/parse
    stories.ts                  ← MODIFIED: 9 LLM handlers → thin wrappers
    characters.ts               ← MODIFIED: 1 LLM handler → thin wrapper
    locations.ts                ← MODIFIED: 1 LLM handler → thin wrapper
```

---

## Pillar 0 — Normalizers: One Source of Truth

LLM output is untrusted `unknown`. Every field must be defensively coerced before use.

**Rule: All LLM output normalisation MUST live in `backend/src/normalizers.ts`. No route file, no service file, and no agent file may contain manual field-by-field coercion.**

### Exports

| Function | Replaces |
|---|---|
| `normaliseRelationship(r)` | Repeated inline relationship coercion |
| `normaliseCharacter(c)` | Inline coercion in `characters.ts` + `stories.ts` |
| `normaliseLocation(l)` | Inline coercion in `locations.ts` + `stories.ts` |
| `normaliseMemoryItem(m)` | `normaliseMemoryDeltas()` in `stories.ts` |
| `parseArray<T>(data, key, normalise, filter)` | All the `.filter().map().filter()` chains |

`parseArray` is the general extraction form:

```ts
parseArray(data, "characters", normaliseCharacter, c => !!c.name)
parseArray(data, "locations",  normaliseLocation,  l => !!l.name)
parseArray(data, "memories",   normaliseMemoryItem, m => !!(m.characterName && m.summary))
```

---

## Pillar 1 — `LLMAgent`: Owned System Prompt Contract

**Rule: All LLM calls that expect a structured JSON response MUST go through `LLMAgent`.**

`LLMAgent` lives in `backend/src/llm-agent.ts`. It is configured once at construction with the full specification of an AI task:

| Field | Purpose |
|---|---|
| `role` | Identity given to the model — "You are a character extractor" |
| `instructions` | What to do with the user's input |
| `outputShape` | The exact JSON template the model must match |
| `temperature` | Fixed for the task (0.85 for generation, 0.1 for parsing) |
| `num_ctx` | Optional context window override (8192 for parse tasks) |

### Interface

```ts
class LLMAgent {
  buildSystemPrompt(): string
  // Assembled header:
  //   "You are a {role}. Your ONLY job is to output a single JSON object — nothing else."
  //   "Do NOT write any analysis, explanation, commentary, or prose."
  //   "Do NOT use markdown or code fences."
  //   {instructions}
  //   "Output ONLY the raw JSON object below, with no text before or after it:"
  //   {outputShape}

  run(userContent: string, overrides?: { temperature?: number; num_ctx?: number }): Promise<Record<string, unknown>>
  // Calls streamChat, accumulates chunks, calls extractJson.
  // Throws LLMParseError(message, raw) on JSON parse failure.
}

class LLMParseError extends Error {
  readonly raw: string  // always forwarded in 422 responses
}
```

### Why this matters

- The "no prose, JSON only" contract is defined once and cannot silently drift between endpoints
- `buildSystemPrompt()` is callable in isolation — prompts are inspectable and testable without hitting Ollama
- When a model changes behavior, you update one agent definition, not 11 route handlers
- Agents are named singletons exported from their respective `agents.ts` files — grep-able, documented

### Error handling contract

Every route catch block that wraps a service call uses this pattern:

```ts
try {
  return await generateSingle(type, concept, ctx)
} catch (err) {
  if (err instanceof LLMParseError)
    return reply.status(422).send({ error: "LLM did not return valid JSON", raw: err.raw })
  throw err
}
```

---

## Pillar 2 — Generation Service

**Rule: Generation route handlers MUST contain no LLM logic. They validate inputs and call the service.**

### Service API

```ts
// backend/src/generation/service.ts

type GenerationType =
  | "story-core" | "story-characters" | "story-locations" | "story-memories"
  | "character" | "location" | "supporting-fields"

interface GenerateContext {
  storyContext?: string      // "Story: X\nPremise: Y"
  styleContext?: string      // "Genres: X\nTone: Y\nWriting style: Z"
  premise?: string
  characterNames?: string[]  // for memory generation
  includeTitle?: boolean     // for story-core
  existingItems?: string[]   // auto-populated by generateList
}

generateSingle(type: GenerationType, concept: string, ctx?: GenerateContext)
  → Promise<Record<string, unknown>>

generateList(type: GenerationType, concept: string, count: number, ctx?: GenerateContext)
  → Promise<Record<string, unknown>[]>
```

### `generateList` design

The current endpoints generate entire arrays in a single LLM call. Quality degrades as the list grows because the model must track more constraints simultaneously. `generateList` calls `generateSingle` N times **sequentially**, passing the names of previously generated items as a "do not repeat" hint. Each item gets its own full context window.

The trade-off (N LLM calls vs 1) is acceptable: these are setup-time operations, not chat-time operations.

### Adding a new generatable entity type

1. Write a new `LLMAgent` instance in `generation/agents.ts` (role, instructions, JSON shape)
2. Add its key to the `GenerationType` union in `generation/service.ts`
3. Add a dispatch case in `generateSingle` pointing to the normaliser
4. Done — immediately available on `POST /ai/generate`. No new route needed.

### Canonical generation endpoint

```
POST /ai/generate
Body: {
  type: GenerationType,
  concept: string,
  context?: GenerateContext,
  count?: number            // omit/1 → single object; >1 → array via generateList
}
```

All existing per-type routes (`/stories/generate-story-characters`, `/:id/characters/generate-fields`, etc.) become **thin backward-compat wrappers** — they validate their specific input shapes and forward to `generateSingle`. Zero LLM or normalisation logic in any route handler.

---

## Pillar 3 — Parse Service + Subscription Foundation

**Rule: Parse route handlers MUST contain no LLM logic. They validate inputs and call the parse service.**

### Service API

```ts
// backend/src/parsing/service.ts

type ParseType =
  | "story-core" | "story-characters" | "story-locations" | "story-memories" | "legacy"

interface ParseContext {
  premise?: string
  characterNames?: string[]
}

parseEntities(type: ParseType, text: string, ctx?: ParseContext)
  → Promise<Record<string, unknown>>
```

### Text sanitization (`parsing/sanitize.ts`)

Before the text reaches the model it passes through `sanitizeTextForParsing()`:

1. Trim leading/trailing whitespace
2. Collapse runs of 3+ blank lines to 2 (reduces wasted context tokens)
3. Strip HTML-like tags (removes formatting noise from pasted content)
4. Prepend `[Known characters: X, Y, Z]` if character names provided — gives the model extraction anchors for characters mentioned only by nickname or pronoun
5. Prepend `[Known locations: ...]` same

This is a **pure function** — no LLM call, fully unit-testable.

### Canonical parse endpoint

```
POST /ai/parse
Body: { type: ParseType, text: string, context?: ParseContext }
```

### Subscription model — Phase 2 foundation

`parseEntities()` is the single function the subscription system needs. The Phase 2 architecture:

```
POST /stories/:id/parse-subscriptions
Body: { types: ParseType[], label?: string }
→ Returns { id: subscriptionId }

GET /stories/:id/parse-stream?sub=<id>
Content-Type: text/event-stream
Emits per resolved type:
  { type: "entity", entityType: ParseType, data: Record<string, unknown> }
  { type: "error",  entityType: ParseType, raw: string }
  { type: "done" }
```

When a chat turn is added, active subscriptions for that story receive a notification. The server calls `parseEntities(type, newTurnText, ctx)` for each subscribed type and streams results as SSE events. No new LLM infrastructure is needed — the service layer is the complete implementation foundation.

---

## What Does Not Change

This mandate covers the AI generation and parsing subsystems only. The following are explicitly **out of scope** and must not be touched:

| System | Files |
|---|---|
| Chat response streaming | `chats.ts`, `context.ts`, `memory-retrieval.ts` |
| Entity state extraction | `extraction.ts` |
| Character state / delta chain | `character-state.ts` |
| Storage layer | `storage.ts` |
| All CRUD routes | All GET/POST/PATCH/DELETE handlers |
| Shared types | `packages/types/src/` |
| Frontend | Everything in `frontend/` |

`extraction.ts` already implements the "registry + typed interface" pattern for LLM utilities. It is correct as-is and is **not** being brought under `LLMAgent`. Its use case (post-turn state detection, non-fatal, temperature 0.1) is architecturally distinct from the generation/parsing layer.

---

## Before and After

| Dimension | Before | After |
|---|---|---|
| LLM boilerplate | 11 copies of the same 20-line block | Zero — lives in `LLMAgent.run()` |
| System prompt definition | Inline string array in each handler | Named agent singleton, one definition |
| Normalisation | Duplicated across 3 route files | `normalizers.ts` — one import |
| Adding a new AI entity type | Touch 5+ files, copy scaffold | Add agent + dispatch case in 2 files |
| Testing prompts | Requires HTTP + LLM call | `agent.buildSystemPrompt()` in isolation |
| Testing normalisation | Requires HTTP + LLM call | Pure functions — unit testable |
| Parse subscription | No foundation | `parseEntities()` is the complete foundation |
| Unified API surface | 11 different URL patterns | `POST /ai/generate` + `POST /ai/parse` |

---

## Acceptance Criteria

The refactor is complete when:

1. `npx tsc --project backend/tsconfig.json --noEmit` passes with zero errors
2. All 11 original LLM-backed endpoints return identical JSON shapes as before (response parity)
3. `POST /ai/generate` and `POST /ai/parse` are functional for all registered types
4. No route handler file imports `streamChat` or calls `extractJson` directly
5. No route handler file contains field-by-field `typeof x === "string"` coercion of LLM output
6. `normaliseCharacter`, `normaliseLocation`, `normaliseMemoryItem` exist only in `normalizers.ts`
