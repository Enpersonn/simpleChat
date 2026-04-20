# Local Roleplay LLM Chat — Project Plan (v2)

> Second-pass review. Additions and structural improvements are integrated throughout.
> Primary model: `igorls/gemma-4-E4B-it-heretic-GGUF` via Ollama.

---

## 1. Product Vision

A fully local, lightweight desktop chat application built for immersive roleplay and collaborative storytelling with local LLMs. Lightweight enough to run alongside a demanding local model. Deep enough to support serious worldbuilding, multi-character narratives, and cinematic storytelling.

**Core Pillars:**
- Fast, clean chat UX that stays out of the way
- Two distinct and well-tuned chat modes (Interactive RP / Storyteller)
- Industry-quality context orchestration with character knowledge isolation
- Deep but skippable story and character creation
- Fully local, inspectable file storage — no cloud dependency, ever

---

## 2. Hard Constraints and Design Principles

From `CLAUDE.md`:
- Clean architecture — clear separation of concerns
- DRY, SRP, vertical slice thinking
- No fake systems. Every feature listed is actually implemented
- Minimal but real: no premature abstractions, no hypothetical feature flags

Operational:
- Lightweight runtime: UI + server together should leave most RAM/VRAM free for model inference
- File-based local storage in simple inspectable JSON/JSONL
- Streaming responses required — no blocking waits
- Zero cloud dependency at runtime

---

## 3. Technology Stack

### Frontend
| Concern | Choice | Why |
|---|---|---|
| Framework | Preact + TypeScript + Vite | Same DX as React, ~3KB runtime vs ~40KB — critical for lightweight target |
| State | Zustand | Minimal boilerplate, fine-grained subscriptions, zero magic |
| Streaming | Native `fetch` + `ReadableStream` reader | No extra deps, works with Ollama SSE natively |
| Styling | CSS Modules + design tokens | No runtime CSS-in-JS cost; tokens allow theming |
| Forms | Custom lightweight form hooks | react-hook-form adds too much bundle for the gain here |
| Markdown | `marked` (minimal, fast) | Render story output as markdown; avoid heavy renderers |
| Routing | `wouter` | ~1.5KB vs React Router's 10KB+ |

### Backend (Local API Proxy)
| Concern | Choice | Why |
|---|---|---|
| Runtime | Node.js 20+ LTS | Broad compatibility, stable FS APIs |
| Server | Fastify + TypeScript | Fastest Node HTTP framework, schema-based routing |
| Validation | Zod | Type-safe schemas shared between frontend and backend |
| Ollama | Local HTTP (`/api/chat`, `/api/tags`) | Direct calls to Ollama REST API |
| Config | `dotenv` / flat JSON config file | Simple, human-readable app settings |

### Shared
- `packages/types` — shared Zod schemas and TypeScript types (monorepo-lite via npm workspaces)
- Biome for lint/format across all packages

### Storage
- `JSON` for structured entities (stories, characters, locations, scenes)
- `JSONL` (append-only) for chat turn logs — no file rewrites needed
- `JSON` for rolling summaries and memory indexes
- Human-readable directory layout — easy to backup, inspect, or share

### Dev / Quality
- Vitest — unit and integration tests
- Playwright — minimal critical-path E2E suite
- No test mocks for core storage or Ollama proxy — real adapters in integration tests

---

## 4. High-Level Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     Presentation Layer                    │
│  Pages: Chat, StoryBuilder, CharacterEditor, Settings     │
│  Shared: Sidebar, ChatPanel, ControlsPanel, StreamOutput  │
└──────────────────┬───────────────────────────────────────┘
                   │ HTTP / SSE
┌──────────────────▼───────────────────────────────────────┐
│                    Application Layer                      │
│  Use-cases: SendTurn, GenerateStorySegment, AutofillField │
│             CreateStory, CreateCharacter, SummarizeSession│
│             RevealFact, AssembleContext                   │
└───────────┬───────────────────────┬──────────────────────┘
            │                       │
┌───────────▼────────────┐ ┌────────▼──────────────────────┐
│     Domain Layer       │ │     Context Engine             │
│  Story, Character,     │ │  ContextAssembler              │
│  Scene, MemoryItem,    │ │  VisibilityFilter              │
│  Turn, KnowledgeGraph  │ │  TokenBudgetManager            │
│  Visibility rules      │ │  RollingSummarizer             │
└───────────┬────────────┘ └────────┬──────────────────────┘
            │                       │
┌───────────▼───────────────────────▼──────────────────────┐
│                   Infrastructure Layer                    │
│  FileStorage adapters  │  OllamaClient  │  StreamProxy    │
└──────────────────────────────────────────────────────────┘
```

### Vertical Slices (Implementation Units)
- `story-setup` — CRUD + AI autofill for stories and all sub-entities
- `chat-interactive` — back-and-forth RP mode with character logic
- `chat-storyteller` — long-narrative autonomous mode
- `context-engine` — token-budgeted prompt assembly + visibility filter
- `character-isolation` — speaker-scoped knowledge filtering
- `memory-system` — extraction, importance scoring, retrieval
- `session-management` — branching, regenerate, undo, export

---

## 5. Feature Set

### 5.1 Chat Modes

#### Mode A: Interactive Roleplay
- Balanced user/LLM turn cadence
- LLM responds in character (first or third person, configurable)
- Character voice anchors enforced per turn
- Short-medium responses by default
- Supports multiple active characters per session, each with isolated context

#### Mode B: Storyteller / Autonomous Narrative
- LLM generates long story segments (narration + dialogue)
- User sends short steering messages: choices, nudges, scene requests
- Pacing instructions embedded in prompt (from example-prompt.md style)
- "Continue story" shortcut for one-click progression
- Full-screen reading mode with clean typography

### 5.2 Story Builder

Progressive disclosure — three entry paths:

**Quick Start**
- Title + premise + tone (3 fields) → AI generates the rest
- Immediately usable in chat

**Standard**
- Structured form: premise, genre, tone, timeline, world rules, writing style
- Characters (core fields per character)
- Locations (1–3 starting locations)
- Active scene/arc description

**Deep Authoring**
- Full character sheets (see §5.3)
- Full location dossiers
- Scene arc breakdowns
- Secrets and hidden motives (GM-only by default)
- Relationship graph
- Lore and glossary entries

**AI Assist Actions** (per section or per field):
- `Fill missing fields` — infer from what is given
- `Expand this field` — add depth to an existing entry
- `Generate 3 alternatives` — offer options to choose from
- `Condense for prompt budget` — auto-summarize long text
- `Check for contradictions` — flag inconsistencies between fields

### 5.3 Character Sheets

Characters are the most important unit. Each sheet has three visibility tiers:

**Public Layer** (shared with all characters and narrator):
- Name, role/title, age/species
- Physical appearance and distinguishing features
- Personality traits (observable behavior)
- Speech style and verbal tics
- Public reputation/backstory

**Party Layer** (shared with a defined character group):
- Shared secrets within the group
- Alliance/faction membership
- Group objectives

**Private Layer** (only this character's context):
- True motives and hidden goals
- Fears and psychological wounds
- Secrets they hold from others
- What they know that others do not (private knowledge facts)
- Moral limits and lines they won't cross
- Emotional state not visible to others

**Relationship Edges:**
- Per-character relationship entries: trust level, history, current attitude, hidden feelings
- Relationship facts have their own visibility tags

**AI Assist for Characters:**
- `Generate backstory from traits`
- `Generate dialogue sample`
- `Suggest secrets consistent with role`
- `Suggest relationship dynamics`

### 5.4 Locations

- Name, type, atmosphere, sensory details
- Who knows about this location (visibility tag)
- Key objects, exits, hazards
- Scene-level state (time of day, weather, current occupants)
- Secrets/hidden areas (GM-only visibility)

### 5.5 Scenes and Arcs

- Scene: current location, active characters, immediate goal, tension, mood
- Arc: sequence of scenes with narrative objective
- Scene transitions: user can manually advance scene or let LLM manage
- Scene state is included in context and updated after each relevant turn

### 5.6 Right Sidebar — Generation Controls

Always visible during chat:

**Quick Controls (always visible):**
- Mode selector (Interactive RP / Storyteller)
- Active characters (who is "on stage" right now)
- Response length: `short` / `medium` / `long` / `paragraph+` (maps to soft token targets)
- Mood tags: multi-select (tense, warm, eerie, playful, melancholy, action-heavy, ...)
- "Feel" free-text box: freeform style instruction, e.g. "sharp dialogue, minimal narration"

**Advanced (collapsible):**
- Temperature, top_p, top_k, repeat_penalty
- Context preview: token budget breakdown (visual)
- Active memory items count
- Prompt profile: save/load named parameter presets

### 5.7 User Persona

- User can define their own character/persona in a story
- Persona sheet follows same structure as NPC characters (public/private layers)
- In interactive mode, user responses are attributed to the persona
- Persona's private knowledge is also scoped correctly

### 5.8 Narrator Role

- Optional "Narrator" perspective available in both modes
- Narrator has read access to all public + party layers
- Narrator does NOT have access to private layers of other characters (prevents omniscience bleed)
- GM-only facts (defined in story builder) are visible only to narrator
- Narrator can manage scene transitions and describe environment

### 5.9 Session and Turn Management

- **Regenerate**: replace last LLM turn with a new generation
- **Edit turn**: user can edit any past turn, with optional re-generation of following context
- **Branch from turn**: fork the chat at any turn into a new chat branch ("what if" branches)
- **Undo**: remove last user + assistant turn pair
- **Pin turn**: mark a turn as canon — rolled summaries always preserve it
- **Annotate turn**: add out-of-character notes to any turn (stored separately, not in context)

### 5.10 Memory System

- After each turn, a lightweight extractor pass identifies:
  - New facts revealed
  - Character state changes
  - Scene state changes
  - Relationship shifts
- Each memory item gets:
  - Importance score (0–1, auto-scored, user-adjustable)
  - Visibility tag (`public` / `party:<groupId>` / `character:<charId>` / `narrator-only`)
  - Tags (character, location, secret, relationship, event, ...)
  - Source reference (turn ID)
- User can view, edit, add, or delete memory items via a "Memory" panel
- Memory retrieval: semantic + recency weighted selection at context assembly time

### 5.11 Session Export and Import

- Export session as a formatted markdown story document
- Export story as a portable JSON pack (story + characters + chat history)
- Import story packs to load community or shared stories
- One-click "summarize session" into a human-readable recap

### 5.12 Prompt Profile Presets

- Users can save current sidebar settings as a named preset
- Ship with sensible defaults: `Cinematic RP`, `Slow Burn Drama`, `Action Heavy`, `Horror Atmospheric`, `Casual Chat`
- Presets are editable and deletable
- Presets stored per-story or globally

### 5.13 App Settings

- Ollama endpoint URL (default `http://localhost:11434`)
- Active model selector (lists available Ollama models)
- Data directory (default to `./data`, configurable for encrypted drives)
- Theme: dark / light
- Font family and size for chat/reading view
- Streaming speed limiter (optional artificial slowdown for typewriter effect)
- Telemetry: permanently OFF, not configurable

---

## 6. Context Engine (Industry-Grade)

This is the most critical non-UI system. It must be real, not approximated.

### 6.1 Context Budget Architecture

Total token budget is configurable (default: 8192, configurable up to model limit).

Budget partitions (ordered by priority — lower priority gets trimmed first):

| Slot | Priority | Description | Typical Size |
|---|---|---|---|
| System Policy | P0 (never trimmed) | Safety, format, mode instructions | ~300 tokens |
| Story Bible | P1 | World rules, tone, genre, writing style | ~500 tokens |
| Active Scene | P2 | Scene state, location, current tension, arc goal | ~400 tokens |
| Active Characters | P3 | Speaker's full sheet + other visible sheets (filtered by visibility) | ~600–1200 tokens |
| Recent Transcript | P4 | Last N turns (most recent first) | ~2000 tokens |
| Retrieved Memories | P5 | Relevant past facts retrieved by memory system | ~500 tokens |
| User Instruction | P6 (never trimmed) | Current sidebar "feel" text | ~100 tokens |

When over budget:
1. Trim retrieved memories first (least recent)
2. Trim transcript window (keep at least 3 turns)
3. Compress story bible (use condensed summary)
4. Never trim system policy or user instruction

### 6.2 Prompt Layer Stack (per turn)

```
[SYSTEM]
  - Base policy (roleplay rules, format, safety)
  - Mode instruction (Interactive RP / Storyteller behavior)
  - Writing style (from story builder or sidebar)

[WORLD]
  - Story premise and rules (condensed if needed)
  - Current arc objective
  - Active scene description

[CHARACTERS — FILTERED BY ACTIVE SPEAKER]
  - Active speaker's full character sheet (all layers)
  - Other on-stage characters: public layer only
  - Relationship edges relevant to active speaker (from their POV)

[MEMORY]
  - Retrieved facts filtered by speaker visibility
  - Pinned canon facts

[TRANSCRIPT]
  - Recent turns (newest first, trimmed to budget)

[USER INSTRUCTION]
  - Sidebar "feel" text
  - Response length target
  - Mood tags as prose instruction
```

### 6.3 Rolling Summarization

- After every N turns (configurable, default 20), trigger a background summarization pass
- Summarization request to the model condenses older turns into a compact recap
- Recap replaces verbatim older turns in context (originals preserved in JSONL file)
- User can manually trigger summarization at any point
- Pinned turns are always included verbatim regardless of summarization

### 6.4 Scene Checkpoint System

- When a scene ends, generate a scene recap automatically
- Scene recaps become permanent memory items with `public` visibility
- Recap captures: what happened, what was revealed, how characters changed
- These recaps form a "story bible extension" that grows with the session

### 6.5 Canon Conflict Detection (optional / advanced)

- Before final output, run a lightweight rule-check pass:
  - Does the response contradict any pinned canon fact?
  - Does it use information the active character cannot know?
- If conflict found: flag to user with option to regenerate with a constraint note injected
- Soft check (user can override), not a hard block

---

## 7. Character Knowledge Isolation

This is the advanced feature that separates this app from generic chat UIs.

### 7.1 The Problem

When Character A and Character B are in the same chat, and the context includes both of their private sheets, the LLM can implicitly blend their knowledge. This breaks character consistency.

### 7.2 The Solution: Speaker-Scoped Context

Every generation call specifies an `activeSpeaker` (the character the LLM is currently voicing).

Context assembly steps:
1. Load all memory items for this story
2. Filter to only items where `visibility` matches:
   - `public` → always included
   - `party:<groupId>` → included if `activeSpeaker` is in the group
   - `character:<charId>` → included only if `activeSpeaker.id === charId`
   - `narrator-only` → included only if `activeSpeaker === "narrator"`
3. Load character sheets in the same filtered way
4. Inject filtered context into character slot

Result: Character A's generation call never sees Character B's private motives.

### 7.3 Reveal System

- When a secret or private fact is discovered in-scene, the LLM will write it into the transcript
- The memory extractor detects the reveal and promotes the visibility tag:
  - `character:mira` → `public` (now everyone knows)
  - Or `character:mira` → `party:group_rebels` if only revealed to that group
- Revealed status is tracked per memory item

### 7.4 Group / Party Knowledge

- Users can define groups in the story (e.g., "The Rebels", "The Guard")
- Memory items can be tagged `party:group_rebels`
- All characters in that group see those items; others do not

### 7.5 Testing Anti-Omniscience

Integration tests for character isolation:
- Assert that Character B's private motive does NOT appear in Character A's context
- Assert that a `narrator-only` fact does NOT appear in any character's context
- Assert that after reveal, item IS present in all-character contexts

---

## 8. Data Model and File Layout

### Directory Structure

```text
/data
  /stories
    /<storyId>/
      story.json            — story metadata, premise, rules, tone, writing style
      characters.json       — array of character sheets (all layers)
      locations.json        — array of location entries
      scenes.json           — scene definitions and arc structure
      groups.json           — party/group definitions for knowledge isolation
      lore.json             — glossary entries, world facts
      prompts.json          — prompt profile presets for this story
      chats/
        <chatId>.jsonl      — append-only turn log
        <chatId>.meta.json  — chat metadata (mode, created, last session, branch info)
      summaries/
        <chatId>-rolling.json    — active rolling summary state
        <chatId>-scenes.json     — completed scene recaps
      memory/
        <chatId>-items.json      — memory items with visibility + importance
        <chatId>-index.json      — retrieval index (lightweight)
  /global
    settings.json           — app config (endpoint, theme, data dir, model)
    prompts.json            — global prompt profile presets
    personas.json           — user persona library (reusable across stories)
```

### Key Entity Schemas

**story.json:**
```json
{
  "id": "story_001",
  "title": "Ashes of Vallor",
  "premise": "A dying empire...",
  "genres": ["dark fantasy", "political intrigue"],
  "tone": ["grim", "intimate", "tense"],
  "rules": ["No modern technology", "Magic has social cost"],
  "writingStyle": "cinematic, sensory-rich, short punchy dialogue",
  "pov": "third-person-limited",
  "createdAt": "2026-04-20T00:00:00Z",
  "updatedAt": "2026-04-20T00:00:00Z"
}
```

**Character entry (in characters.json):**
```json
{
  "id": "char_mira",
  "storyId": "story_001",
  "name": "Mira Vael",
  "role": "spymaster",
  "public": {
    "appearance": "...",
    "personality": ["measured", "observant", "wry"],
    "speechStyle": "indirect, laced with implication",
    "reputation": "Trusted advisor to the Regent"
  },
  "party": {
    "groupIds": ["group_inner_circle"],
    "sharedSecrets": ["The Regent is dying"]
  },
  "private": {
    "trueMotives": "Wants to see the old republic restored",
    "fears": ["Losing control", "Being seen as weak"],
    "privateKnowledge": ["The assassination attempt was staged by the Regent"],
    "moralLimits": "Will not harm children",
    "hiddenRelationships": [{"charId": "char_aldric", "truth": "Former lover, still loyal"}]
  },
  "relationships": [
    {
      "charId": "char_regent",
      "publicAttitude": "Respectful loyalty",
      "privateAttitude": "Quiet contempt",
      "visibility": "character:char_mira"
    }
  ]
}
```

**Memory item:**
```json
{
  "id": "mem_104",
  "storyId": "story_001",
  "chatId": "chat_001",
  "sourceTurnId": "turn_042",
  "content": "Mira secretly works for the rebel faction.",
  "visibility": "character:char_mira",
  "tags": ["secret", "allegiance", "faction"],
  "importance": 0.92,
  "revealed": false,
  "revealedAt": null,
  "revealedTo": null,
  "timestamp": "2026-04-20T00:14:05Z"
}
```

**Chat turn (JSONL line):**
```json
{"id":"turn_042","chatId":"chat_001","speaker":"char_mira","role":"assistant","text":"...","timestamp":"2026-04-20T00:14:00Z","meta":{"mode":"interactive","promptTokens":3200,"completionTokens":180,"modelParams":{"temperature":0.85}}}
```

---

## 9. System Prompt Strategy (Quality)

The base system prompt is the most important quality lever. It encodes the example-prompt.md style guidelines as first-class rules.

### Base System Prompt (Interactive RP Mode)
```
You are [CHARACTER NAME]. Stay in character at all times.
Narrate with sensory detail: sight, sound, touch.
Show emotion through behavior and subtext — not explicit statements.
Use tight, purposeful dialogue with action beats instead of dialogue tags.
Avoid internal exposition unless thinking in-character.
Let scenes breathe with small gestures, pauses, environment details.
Keep responses [LENGTH TARGET]. Never break character.
The world follows these rules: [STORY RULES].
Current scene: [SCENE DESCRIPTION].
Your character only knows what is in your character sheet and the conversation so far.
```

### Base System Prompt (Storyteller Mode)
```
You are the narrator of an ongoing story.
Write in cinematic third-person. Alternate narration with dialogue.
Use the pacing structure: action → internal thought → dialogue → environment.
Subtext over explicit. Show, never tell.
End each passage with a hook, shift, or unresolved beat.
Respect these story rules: [STORY RULES].
Current tone: [MOOD TAGS].
Generate approximately [LENGTH TARGET] words.
```

### Mood Tag → Prompt Injection Map
- `tense` → "Build micro-tension. Use short sentences. Withhold resolution."
- `warm` → "Allow vulnerability. Slow the pace. Let characters connect genuinely."
- `eerie` → "Describe environment with dread. Imply wrongness. Avoid direct horror."
- `playful` → "Allow wit and banter. Light touch, natural rhythm."
- `melancholy` → "Linger in emotional weight. Quiet moments. Understated grief."
- `action` → "Short sharp prose. Fast rhythm. Kinetic energy in every sentence."

---

## 10. API Surface

### Story Management
```
GET    /stories                      — list all stories
POST   /stories                      — create new story
GET    /stories/:id                  — get full story with sub-entities
PATCH  /stories/:id                  — update story fields
DELETE /stories/:id                  — delete story and all data

POST   /stories/:id/autofill         — AI autofill for story fields
POST   /stories/:id/export           — export as portable JSON pack
POST   /stories/import               — import story pack
```

### Character / Location / Scene
```
POST   /stories/:id/characters       — create character
PATCH  /stories/:id/characters/:cid  — update character
DELETE /stories/:id/characters/:cid

POST   /stories/:id/locations
PATCH  /stories/:id/locations/:lid

POST   /stories/:id/scenes
PATCH  /stories/:id/scenes/:sid
```

### Chat
```
POST   /chats                        — create chat (storyId, mode, activeSpeakers)
GET    /chats/:id/history            — get full turn log
POST   /chats/:id/message            — send turn (streams response via SSE)
POST   /chats/:id/regenerate         — regenerate last assistant turn (streams)
POST   /chats/:id/branch             — fork from turn ID into new chat
PATCH  /chats/:id/turns/:tid         — edit a turn
DELETE /chats/:id/turns/:tid         — delete a turn (and optionally following turns)
POST   /chats/:id/summarize          — trigger manual summarization
```

### Memory
```
GET    /chats/:id/memory             — list memory items
POST   /chats/:id/memory             — manually add memory item
PATCH  /chats/:id/memory/:mid        — edit item (visibility, importance, content)
DELETE /chats/:id/memory/:mid
POST   /chats/:id/memory/reveal/:mid — promote visibility after in-scene reveal
```

### Context (Power User / Debug)
```
POST   /context/preview              — assemble and return full context for a turn (dry run)
POST   /context/validate             — check for canon conflicts in a proposed response
```

### Ollama Proxy
```
GET    /ollama/models                — list available Ollama models
GET    /ollama/health                — ping Ollama endpoint
```

### Settings
```
GET    /settings
PATCH  /settings
```

---

## 11. UX Design

### Layout

**Desktop (primary):**
```
┌─────────────┬──────────────────────────────┬─────────────────┐
│  Left Panel │        Chat Panel            │   Right Panel   │
│  ~220px     │        flex-grow             │   ~280px        │
│             │                              │                 │
│ Story List  │  [transcript + messages]     │  Mode selector  │
│  ─────────  │                              │  Characters     │
│ Chat List   │  [streaming output]          │  Mood tags      │
│  ─────────  │                              │  Length         │
│ + New Story │  [composer input]            │  Feel text box  │
│ + New Chat  │                              │  ─────────────  │
│             │                              │  Advanced       │
│             │                              │  (collapsible)  │
└─────────────┴──────────────────────────────┴─────────────────┘
```

**Reading Mode (Storyteller):**
- Left and right panels collapse
- Chat panel goes full width with reading-optimized font
- Composer moves to bottom bar with `Continue` and `Steer` shortcuts

**Mobile:**
- Bottom tab bar: Stories / Chat / Controls
- Swipe between panes
- Sticky composer

### UX Details
- Stream tokens progressively with cursor indicator
- Stop generation button visible during streaming
- Regenerate button appears after each LLM turn
- Turn attribution labels (character name + avatar initial)
- Pinned turns visually marked
- Annotated turns show a note icon
- Branched chats show branch indicator in chat list
- Token budget progress bar in right panel (optional, collapsible)
- Markdown rendering in chat output (bold, italic, scene breaks)

### Story Builder UX
- Tab-based sections: Overview / Characters / Locations / Scenes / Secrets / Style
- Each section: manual fields + "Fill with AI" button
- Character list with expandable cards (public → party → private tiers)
- Relationship web: simple force-directed visualization (lightweight, canvas-based)
- All AI-generated content is shown in an editable preview before saving

### Onboarding
- First launch: "Quick Start" wizard (3 steps: model check → create first story → open chat)
- Model health check at startup with friendly error if Ollama unreachable

---

## 12. Performance Targets and Tactics

**Targets:**
- App idle memory: < 80MB (leave GPU VRAM and system RAM to model)
- Initial load: < 1.5s on a typical dev machine
- First token latency: dominated by model, not app (< 50ms app overhead)
- File writes: append-only turns (no full-file rewrites during chat)
- Summarization: background task after turn, does not block UI

**Engineering Tactics:**
- No heavy component libraries (no MUI, no Chakra)
- Virtualized transcript list (only render visible turns)
- Lazy-load story builder panels (not loaded until opened)
- Background summarization deferred to `requestIdleCallback` equivalent
- Memoize all derived state in Zustand selectors
- Context assembly runs on server side (off main thread from UI perspective)
- Debounce sidebar control changes before rebuilding context

---

## 13. Testing Strategy

### Unit Tests
- Context visibility filtering: assert correct exclusion of private facts per speaker
- Token budget manager: trimming logic and partition priority
- Prompt assembly: correct layer order, mood tag injection
- Story builder validation: required fields, AI autofill contract
- Memory importance scorer
- Reveal system: visibility promotion logic

### Integration Tests
- Send message → stream → persist turn → memory extraction
- Autofill field → edit → save → verify persistence
- Multi-character isolation scenario: assert Character B's motives absent from Character A's context
- Branch chat from turn → verify branch history correct
- Rolling summarization: verify verbatim turns replaced, pinned turns preserved

### E2E Smoke Tests (Playwright)
- Create story → create character → open chat → complete 3 turns → verify stored
- Switch modes (Interactive ↔ Storyteller) without data loss
- Regenerate last turn → verify previous turn replaced
- Export story pack → import into fresh state → verify story loads

---

## 14. Security and Privacy

- Local-only server binding (`127.0.0.1` only, never `0.0.0.0` by default)
- No telemetry, no analytics, no external HTTP calls at runtime
- Log sanitization: no chat content in server logs by default
- Data directory configurable to encrypted drive
- No credential storage needed (all local)
- CORS configured to allow only localhost origins

---

## 15. Implementation Phases

### Phase 0 — Foundation (Week 1)
- Monorepo setup (frontend / backend / shared types)
- Fastify server with Zod validation
- Ollama streaming proxy endpoint
- Basic chat UI: input → stream → display
- File storage adapter (story + chat JSONL)
- Ollama health check and model list

### Phase 1 — Core MVP (Week 2)
- Story CRUD (create, list, select, delete)
- Interactive RP chat mode fully working
- Right sidebar: mode, length, mood tags, feel text
- Sidebar parameters bound to generation pipeline
- Streaming with stop/regenerate
- Session persistence across refresh

### Phase 2 — Story Builder v1 (Week 3)
- Story overview form (premise, tone, rules, style)
- Character creation: public layer + private layer
- Location creation
- AI autofill per field (calls model, returns editable draft)
- Story selection → binds to new chat

### Phase 3 — Context Engine v1 (Week 4)
- Token budget manager with partition priority
- Context assembler with all prompt layers
- Rolling summarization (background, post-turn)
- Scene checkpoint generation
- Context preview endpoint for debugging

### Phase 4 — Character Isolation (Week 5)
- Visibility tag system on all memory items and character fields
- Speaker-scoped context assembly
- Group/party knowledge support
- Reveal system + visibility promotion
- Integration tests for anti-omniscience

### Phase 5 — Deep Authoring (Week 6)
- Full character sheets (party layer + relationship edges)
- Location dossiers
- Scene/arc definitions
- Lore / glossary
- Relationship graph visualization (simple)
- AI alternatives and contradiction check

### Phase 6 — Session Power Features (Week 7)
- Branch from turn
- Edit and delete turns
- Pin turns + annotation
- Manual memory management UI
- Prompt profile presets (save/load)
- User persona system

### Phase 7 — Polish and QoL (Week 8)
- Storyteller mode full-screen reading view
- Typewriter streaming option
- Import/export story packs
- Session export as markdown
- Onboarding wizard
- Mobile layout

---

## 16. Stretch Features (Post-v1)

| Feature | Value | Effort |
|---|---|---|
| Lorebook quick-search + pinned canon facts UI | High | Low |
| Scene card drag-and-drop arc planning | Medium | Medium |
| Character voice audio (TTS integration) | Medium | High |
| Relationship arc tracking over sessions | High | Medium |
| Branch timeline visualization | High | High |
| Session replay for narrative review | Medium | Medium |
| Genre template library (fantasy, sci-fi, horror, noir) | High | Low |
| Collaborative multiplayer (two users, same Ollama) | Medium | Very High |
| Model-specific prompt profile library | Medium | Low |

---

## 17. Definition of Done (Project Level)

- Both chat modes are stable, pleasant, and produce high-quality output
- Character isolation prevents private motive leakage — verified by automated tests
- Story builder supports casual quick-start and deep authoring equally well
- AI autofill is integrated, editable, non-destructive
- Context engine handles sessions of 100+ turns without quality degradation
- All data is on-disk, human-readable, portable, and backed-up safely
- App idle memory stays under 80MB on a typical Windows 11 machine
- First-time users can create a story and start chatting within 3 minutes

---

## 18. Immediate Build Checklist (Phase 0 Start)

- [ ] Init monorepo: `frontend/`, `backend/`, `packages/types/`
- [ ] Bootstrap Preact + Vite + TypeScript + Zustand frontend
- [ ] Bootstrap Fastify + TypeScript + Zod backend
- [ ] Implement Ollama streaming proxy (`POST /chats/:id/message` → SSE)
- [ ] Implement basic chat UI (input box, transcript, stream rendering)
- [ ] Implement file storage adapter (story.json, chat JSONL)
- [ ] Bind right sidebar parameters to Ollama request payload
- [ ] Add story CRUD endpoints and connect to UI
- [ ] Write context assembler v0 (flat, no isolation yet)
- [ ] Write first integration test: send → stream → persist

---

*Document version 2. Last updated 2026-04-20.*
