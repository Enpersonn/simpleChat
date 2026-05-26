# SimpleChat × llm-helpers — Integration & Agentic Redesign Plan

> Written 2026-05-26. References `D:\workprojects\llm-helpers` as the package source.

---

## Current State Snapshot

The backend has already outgrown what AGENTS.md documents. Key facts that shape this plan:

- Feature-based vertical slices under `backend/src/features/`
- A `createService` / `step` / `silentStep` pipeline drives the entire chat generation flow
- `createPromptRunner` is the single abstraction over LLM JSON calls — but it manually
  reconstructs a JSON example via `schemaToExample()` (a Zod v3 workaround) and relies on
  `extractJson()` fallback parsing
- `getAllTools()` in `backend/src/LLM/tools/tools/index.ts` already defines ~20+ data-access
  tools backed by the stores — but `server.ts` is empty; nothing connects these tools to an
  LLM agent loop yet
- `backend/src/LLM/skills/` exists as a folder stub, not yet populated
- `extractFromText` (story import) hand-rolls `withRetry` and `withConcurrencyLimit`
- All LLM calls ultimately go through `streamChat` in `ollama.ts` — no provider abstraction

---

## Part 1 — Replace the LLM Layer with the Router

### The problem today

`createPromptRunner` calls `streamChat` directly. To get JSON output it:
1. Builds a fake example JSON via `schemaToExample()` — a fragile ~50-line recursive function
   that handles maybe 70% of Zod types
2. Streams the full response into a string
3. Calls `extractJson()` to strip code fences and hope the LLM didn't add prose
4. Runs `schema.parse()` — if that throws, the whole call fails

This breaks on nested unions, discriminated types, `z.lazy`, and any schema not covered by
`schemaToExample`. It also means `createPromptRunner` is the only code path for JSON calls;
ad-hoc LLM calls in generation agents re-invent the wheel.

### What the router gives us

`@llm-helpers/an-llm-request-router` with the Ollama adapter provides:

```ts
const llm = createLLM(
  { defaultProvider: 'ollama', providers: { ollama: { baseUrl, model } } },
  { adapters: { ollama } }
);

// Streaming chat (replaces streamChat)
const stream = await llm.use('ollama').stream({ messages, temperature, ... });

// JSON output with Zod schema — no schemaToExample, no extractJson
const result = await llm.use('ollama').json({ messages, schema: MyZodSchema });

// Tool calls (native Ollama tool_calls format)
const toolResult = await llm.use('ollama').tool({ messages, tools });
```

The `json()` method uses Zod v4's `z.toJSONSchema()` to produce a proper JSON Schema,
passes it as `format` to Ollama, and validates the response with `schema.parse()`. No
heuristic parsing.

### Migration path

**Prerequisite:** Zod v3 → v4 in `packages/types` and `backend`. Zod v4 is largely
backward-compatible for the schemas SimpleChat uses; the main breaking change is import
style (`import { z } from 'zod'` stays the same, but a few rarely-used APIs moved). Run
`npx zod-migration-codemod` to catch most of it automatically.

**Step 1 — Create `backend/src/LLM/llm-client.ts`**

A thin module that builds and exports the `LLM` singleton, reading `ollamaEndpoint()` and
`activeModel()` from config. Applies the `localhost → 127.0.0.1` normalisation before
passing `baseUrl` to the adapter (the router does not do this automatically on Windows).

```ts
// llm-client.ts
export async function getLLMClient(): Promise<LLM> { ... }
export async function getOllamaAdapter() { ... }
```

**Step 2 — Replace `createPromptRunner`**

`createPromptRunner` becomes a thin wrapper around `llm.json()`:

```ts
export const createPromptRunner = <T extends z.ZodTypeAny>(config) => ({
  run: async (userContent, overrides?) =>
    llm.use('ollama').json({
      messages: [system(config), user(userContent)],
      schema: config.outputSchema,
      temperature: overrides?.temperature ?? config.temperature,
    })
});
```

`schemaToExample()` and `extractJson()` calls in this path disappear entirely.

**Step 3 — Replace `streamChat` in `llm.step.ts`**

The main chat generation step calls `streamChat` directly today. Replace with:

```ts
const stream = await llmClient.stream({ messages, model, temperature, ... });
for await (const chunk of stream) {
  ctx.reply.raw.write(JSON.stringify({ content: chunk.text }) + '\n');
  ctx.assistantText += chunk.text;
}
```

**Step 4 — Multi-provider (future unlock)**

Once the router is in place, adding Anthropic or OpenAI as fallback/override models
requires only adding an adapter to `createLLM`'s `providers` map and updating
`AppSettings.activeModel` to accept a `provider:model` format. No code changes to
callers.

---

## Part 2 — Core Utilities (`@llm-helpers/core`)

### Replace hand-rolled retry and signal logic

`extract-from-text/index.ts` contains:
- `withRetry(fn, attempts)` — replace with `callWithRetry(fn, policy, onRetry?)`
- `withConcurrencyLimit(fns, limit)` — keep as-is; not in llm-helpers, not worth adding a
  dependency for a pure async scheduler

`ollama.ts` health check uses `AbortSignal.timeout(3000)` directly. Any place that needs
to compose a caller-provided signal with a timeout should use `buildCombinedSignal(signal, 3000)`.

The `RetryPolicy` from `@llm-helpers/core` supports exponential backoff, jitter, max
attempts, and `AbortError` pass-through — all things the current `withRetry` stub ignores.

---

## Part 3 — Wire the Existing Tools into a Real Tool System

### The gap

`getAllTools()` already defines a rich set of data-access tools (stories, characters,
locations, chats, turns, memories, timeline, field defs). The `Tool<TInput, TOutput>`
interface in `register-tool.ts` is structurally identical to `FunctionTool` from
`@llm-helpers/tools`. But nothing connects these to an LLM — `server.ts` is empty.

### What to do

**Step 1 — Adopt `defineTool` / `createFunctionProvider`**

Replace the local `Tool` interface with `defineTool` from `@llm-helpers/tools`.
`getAllTools()` becomes a `FunctionToolProvider`:

```ts
import { createFunctionProvider, defineTool } from '@llm-helpers/tools';

export const storyDataProvider = createFunctionProvider('story-data', getAllTools());
```

The existing tool definitions need minimal change: rename `schema` → `input` and
`execute` keeps its signature.

**Step 2 — Create the tool system**

```ts
export const storyToolSystem = createToolSystem({
  providers: [storyDataProvider],
  permissions: createPermissions({
    rules: [allow('*.get*'), allow('*.list*'), deny('*.delete*')],
    default: ask(),
  }),
  timeout: 10_000,
});
```

Permissions are important here: LLM agents should be able to read freely but should require
confirmation for any write/delete operation. The `requestApproval` callback can stream an
approval-request frame to the frontend.

**Step 3 — Add story-context tools for in-chat use**

Beyond the existing CRUD tools, add tools specifically useful during a chat turn:

| Tool name | What it does |
|---|---|
| `memory.search(query, charId)` | Semantic/tag search over character memories |
| `memory.write(charId, summary, tags, importance)` | Character creates a new memory mid-turn |
| `location.describe(locationId)` | Get full location detail on demand |
| `story.getContext()` | Return premise, tone, rules as a compact block |
| `character.getState(charId)` | Get effective character state (post-delta-chain) |
| `timeline.getRecent(n)` | Last N canon events |

These let the agent pull context on demand rather than receiving a 10KB system prompt dump
upfront.

---

## Part 4 — Agentic Chat Architecture

### Current model (context dump)

Every chat turn:
1. Loads all memories
2. Retrieves relevant subset via heuristics + LLM scoring
3. Assembles a large system prompt from everything
4. Makes one LLM call
5. Extracts state changes post-hoc

The LLM receives everything passively; it cannot ask for more information or take actions.

### Proposed model (agent loop)

Replace the single `runLlmStep` with an agent loop using `@llm-helpers/an-agent-runtime-handler`:

```
User turn received
  → Prepare lean system prompt (role instructions + story brief only)
  → Start agent with story-data tool system
  → Agent loop:
      LLM can call tools to pull what it needs:
        - memory.search("what do I know about the crown?", speakerId)
        - character.getState(rivalId)
        - location.describe(currentLocationId)
        - timeline.getRecent(5)
      LLM can call write tools to record what happened:
        - memory.write(speakerId, "Learned about the crown's location", ...)
        - timeline.addEntry(storyId, { event, characters, location })
      When satisfied, LLM produces final response text and returns stop
  → Stream content chunks to client via bus 'token' events
  → Persist result
```

**Why this is better:**
- Characters actively recall what they need instead of being handed a wall of text
- Important events get recorded into canon automatically, not via a post-hoc extraction pass
- The system prompt stays lean; token budget goes to the actual conversation
- Characters with many memories don't slow down every turn — they only pay for the memories
  they actually consult
- New capabilities (web search, dice rolls, weather, etc.) are tools, not hardcoded pipeline steps

**Agent configuration per character:**

```ts
const characterAgent = createAgent(
  llm.use('ollama'),   // or llm.use('anthropic') for a premium character
  storyToolSystem,
  {
    maxSteps: 8,
    timeout: 30_000,
    retry: { maxAttempts: 2, backoff: 'exponential' },
    stream: true,   // emit 'token' bus events per chunk
    hooks: {
      beforeToolCall: (call) => stream.pipeline('tool_call', 'start', call),
      afterToolCall:  (call, result) => stream.pipeline('tool_call', 'complete', result),
    }
  }
);
```

**Stream protocol additions:**

Add two new NDJSON frame types to the existing stream protocol:

| Frame | Fields | When |
|---|---|---|
| `toolCall` | `{ toolCall: { name, args } }` | Agent invokes a tool |
| `toolResult` | `{ toolResult: { name, result } }` | Tool returns |

The frontend can optionally display these in a debug/trace panel (the existing debug panel
already shows system prompts — tool traces fit naturally there).

**Extraction becomes a write tool, not a post-hoc pass:**

`extractStateStep` currently runs after the LLM responds and makes a second LLM call to
infer location changes. In the agent model, the character simply calls
`location.moveTo(locationId)` if they move. The extraction step is replaced by the agent's
own awareness. For users who don't want agentic mode, extraction can remain as a fallback.

---

## Part 5 — Skills for Structured Workflows

Not every operation needs an agent loop. Some workflows are deterministic: "retrieve
relevant memories" and "generate a character bio" have clear steps that don't benefit from
LLM autonomy. These are skills.

### Replace `memory-retrieval.ts` with a skill

The current `findRelevantMemories()` is a two-pass process (tag filter → LLM scoring).
This maps cleanly to a skill:

```ts
const memoryRetrievalSkill = defineSkill({
  name: 'memory.retrieveRelevant',
  description: 'Find memories relevant to recent conversation',
  input: z.object({ charId: z.string(), recentText: z.string(), maxResults: z.number() }),
  needs: { tools: ['memories.list', 'memories.search'] },
  execute: async (input, ctx) => {
    const all = await ctx.tool('memories.list', { charId: input.charId });
    // tag pass
    const byTags = tagScore(all, input.recentText);
    if (byTags.length >= input.maxResults) return byTags.slice(0, input.maxResults);
    // LLM fallback
    const remaining = all.filter(m => !byTags.includes(m));
    const scored = await ctx.llm([...scoringMessages(remaining, input.recentText)]);
    return merge(byTags, scored).slice(0, input.maxResults);
  }
});
```

Using `createSkillRunner` this runs standalone with no agent loop overhead.

### Story generation as skills

The generation pipeline (`generateSingle`, `generateList`) is a series of LLM calls that
could be composed as skills with proper dependency tracking:

```
skill: story.generate
  → skill: story.generateCore    (→ llm.json)
  → skill: story.generateChars   (→ llm.json, needs: story.generateCore result)
  → skill: story.generateLocs    (→ llm.json, needs: story.generateCore result)
  → skill: story.generateMemories(→ llm.json, needs: chars result)
```

Each skill is independently testable and retryable.

---

## Part 6 — MCP Connectivity

`@llm-helpers/an-mcp-runtime-handler` provides a full MCP client and multi-server manager.
This opens SimpleChat to the growing ecosystem of MCP servers without writing integrations
by hand.

### Story import from Google Drive

Today importing a story requires pasting raw text into the UI. With an MCP connection to
Google Drive:

1. User provides a Google Doc URL or selects from their Drive
2. The Drive MCP server exposes a `read_document` tool
3. `extractFromText` runs on the document content exactly as it does today
4. Characters, locations, and story facts are populated automatically

The MCP auth flow uses `@llm-helpers/an-mcp-runtime-handler`'s OAuth provider support —
the user authenticates once; the token is stored in settings.

Other immediately useful MCP servers:

| MCP server | Use in SimpleChat |
|---|---|
| **Google Drive** | Import stories from Docs, save session summaries back |
| **Wikipedia / Brave Search** | World-building: "what does a Victorian prison look like?" |
| **Filesystem** | Import local `.txt` / `.md` files without the text-paste UI |
| **Stable Diffusion / ComfyUI** | Generate character portrait images mid-chat |
| **Calendar** | Track in-story time against real dates for campaign scheduling |

### MCP server registry in settings

Add an `mcpServers` field to `AppSettings`:

```ts
mcpServers: z.array(z.object({
  id: z.string(),
  label: z.string(),
  transport: z.discriminatedUnion('type', [
    z.object({ type: z.literal('stdio'), command: z.string(), args: z.array(z.string()) }),
    z.object({ type: z.literal('http'),  url: z.string() }),
  ]),
  enabled: z.boolean().default(true),
}))
```

At startup, `createMcpManager` connects all enabled servers. Their tools are merged into the
story tool system and become available to agents automatically.

---

## Part 7 — Codebase Cleanup

Independent of the llm-helpers migration, several things have rotted or accumulated debt:

### AGENTS.md is out of date
The doc still describes the old flat layout (`backend/src/context.ts`,
`backend/src/extraction.ts`, `backend/src/routes/`). The actual code lives in
`backend/src/features/`. Update it to reflect the current feature-based structure, the
pipeline system, and the `createPromptRunner` abstraction.

### `schemaToExample()` can be deleted
Once `createPromptRunner` routes through the router's `json()` method, the entire
`schemaToExample` function (50+ lines) and its associated `rootSchemaKind` helper disappear.
Same for the `extractJson()` call site in `create-prompt-runner.ts`.

### `OllamaMessage` → `LLMMessage`
`packages/types/src/ollama.ts` defines `OllamaMessage` as `{ role, content }`. Replace it
with `LLMMessage` from `@llm-helpers/types`, which is a superset (adds `toolCalls`,
`toolCallId`, `toolContent`). This is required for tool-call-capable message history.

### `withRetry` in `extract-from-text`
Delete the local stub; use `callWithRetry` from `@llm-helpers/core`. Same policy, better
behaviour (respects `AbortError`, supports backoff).

### Empty stubs
`backend/src/LLM/tools/server.ts` is a 1-line file. Either implement it as part of this
work or delete it. Same for `backend/src/LLM/skills/permissions.ts` if it's empty.

### Parsing pipeline consolidation
`backend/src/LLM/parsing/` contains `census-agent.ts`, `identity-agent.ts`,
`relationship-agent.ts`, `pipeline.ts`, `service.ts`. These are all `createPromptRunner`
instances wired together. Once the router is adopted they simplify significantly; consider
whether they can fold into the `extractFromText` path or remain separate for the
character-import use case.

### `generateRawText` is a grab-bag
`generation/service.ts` exports `generateRawText(prompt, temp)` — a raw LLM call with no
schema. Every call site should either use `json()` with a schema or the streaming path.
Find all callers and migrate; then delete `generateRawText`.

---

## Part 8 — Suggested Sequencing

Each phase is independent enough to ship without the others. Phases 1–3 are pure cleanup;
Phases 4–5 add capability.

### Phase 1 — Zod v4 migration (1–2 days)
Required gate for everything else. Run the codemod, fix any remaining issues in
`packages/types`. This does not change any runtime behaviour.

### Phase 2 — LLM router + core utilities (2–3 days)
- Add `llm-helpers` packages as workspace dependencies
- Create `llm-client.ts` singleton
- Rewrite `createPromptRunner` to use `llm.json()`
- Replace `streamChat` in `llm.step.ts` with router streaming
- Delete `schemaToExample`, `extractJson` (in this path), local `withRetry`
- Replace `OllamaMessage` with `LLMMessage`

Deliverable: identical runtime behaviour, zero custom JSON-parsing hacks, multi-provider
unlocked in config.

### Phase 3 — Tool system wiring (2–3 days)
- Adopt `defineTool` / `createFunctionProvider` for `getAllTools()`
- Create `storyToolSystem` with permission rules
- Implement `server.ts` — expose the tool system via a Fastify route or internal service
- Add the in-chat context tools (`memory.search`, `memory.write`, `character.getState`, etc.)

Deliverable: tools defined, permissioned, and callable — not yet in the agent loop.

### Phase 4 — Agentic chat loop (3–5 days)
- Replace `runLlmStep` with `an-agent-runtime-handler` agent
- Add `toolCall` / `toolResult` stream frames
- Wire `stream: true` bus token events to the existing content frame
- Replace extraction step with agent write-tool calls (or keep as fallback)
- Add trace display to the frontend debug panel

Deliverable: characters actively query their world during a turn. Story state writes happen
in real time, not post-hoc.

### Phase 5 — MCP connectivity (2–3 days per integration)
- Add `mcpServers` to `AppSettings` schema and settings UI
- Create `McpManager` singleton, connect on startup
- Merge MCP tools into `storyToolSystem`
- Implement Google Drive integration first (highest story-import value)
- Add filesystem MCP for local file import

Deliverable: stories can be imported directly from Google Drive; users can connect any MCP
server from settings.

### Phase 6 — Skills refactor (ongoing)
- Migrate `findRelevantMemories` to `defineSkill`
- Migrate story generation pipeline to skills
- Add `SkillRunner` for standalone skill execution
- Document skill/tool boundary in AGENTS.md

---

## Dependency Summary

```
llm-helpers packages needed (as workspace or npm deps):
  @llm-helpers/types                 — LLMMessage, provider capability interfaces
  @llm-helpers/core                  — callWithRetry, buildCombinedSignal, Bus
  @llm-helpers/an-llm-request-router — LLM singleton, Ollama/Anthropic adapters
  @llm-helpers/tools                 — defineTool, createFunctionProvider, createToolSystem
  @llm-helpers/skills                — defineSkill, createSkillRunner (Phase 6)
  @llm-helpers/an-agent-runtime-handler — createAgent, agent loop (Phase 4)
  @llm-helpers/an-mcp-runtime-handler   — createMcpClient, createMcpManager (Phase 5)

Not needed now:
  @llm-helpers/agents          — multi-agent orchestrator (overkill until Phase 4 is stable)
  @llm-helpers/workspace-tools — file/shell/git tools (not relevant to this domain)
```

---

## What This Doesn't Change

- The vertical slice feature structure stays — this plan adds to it, doesn't replace it
- The `createService` / `step` pipeline stays — the agent loop becomes a step within it
- Storage layer stays as-is — tools wrap the existing store functions, they don't replace them
- Frontend stream protocol is additive — new frame types, nothing removed
- The JSON file storage model stays — no database migration implied here
