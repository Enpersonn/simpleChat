Good set of questions. Let me take them in order because they're connected.

---

## Skills In The NOS Architecture

Skills — in the sense of reusable, composable prompt workflows — sit at a specific layer in the stack: **between raw tools and full agents**.

```
Agents     World Agent, Character Agents, Narrator Agent
           — full reasoning loops, own a role, manage state
              ↑
Skills     reconstruct_recent_past, compact_scene, derive_speech_profile
           — composed sequences of tool calls + LLM calls
           — parameterized, reusable, no reasoning loop of their own
              ↑
Tools      read_location, search_memories, commit_state_diff, embed_text
           — atomic operations, deterministic where possible
           — no LLM involved, just DB queries or computation
```

Concrete examples of where skills fit in NOS:

- **`reconstruct_recent_past(characterId, storyDay)`** — this is a skill, not a tool and not a full agent. It calls `get_character_schedule`, `get_relationships`, `calculate_physiological_state`, then makes one LLM call to generate the plausible "day so far", then writes the result via `commit_state_diff`. Reusable by both the Simulation Engine and Character Agents.

- **`compact_scene(turnRange)`** — reads a turn window, extracts key facts, generates a structured memory record, embeds it, writes it. A Background Processing System (§3.2) invokes this skill — it doesn't need a full agent loop.

- **`promote_character_lod(characterId, targetLod)`** — reads existing state, calls a generation skill to fill the new tier, validates backward compatibility, writes. Called by the World Agent but implemented as a reusable skill.

Skills are also where you put the **batching enforcement** from §12.3. A skill that fetches Layer 1 context is responsible for batching all its sub-requests into one DB round-trip.

---

## MCP — Yes, And Here's Why It's Not Overkill

Build the tool layer as an MCP server. The reasons compound:

**Architectural fit:** MCP is exactly the protocol for "agent calls a tool, gets a structured result." The NOS tool layer is the same concept. Building it as MCP means you're not inventing a proprietary wire format for something the industry has already standardized.

**LLM portability:** Your NOS agents need to call tools. If the tool definitions are MCP-compliant, you can route those calls through Ollama (which supports OpenAI-compatible tool calling, close to MCP), Claude API (native MCP), or any future model — without rewriting tool definitions. The engines are model-agnostic.

**The World Agent constraint becomes enforceable:** MCP lets you define which tools are exposed to which agent. Character Agents and the Narrator get a read-only tool subset. Only the World Agent gets the write tools. This is an architectural enforcement of §3.1's core rule, not just a convention.

**Tooling ecosystem:** Claude Code, Cursor, VS Code extensions — they all speak MCP. Your NOS tools could eventually be introspectable and debuggable from those environments without extra work.

The practical implementation is an MCP server running alongside your Fastify backend — it's just another HTTP server exposing tool schemas and handling invocations.

---

## The Tool Set For NOS

Organized by the layer hierarchy and write boundary:

### READ — Layer 1 (structured, most turns)
```
get_scene_brief(sceneId)                    → location + present chars + last N turns
get_location_detail(locationId)             → full sensory state, contents, layout
get_location_connections(locationId)        → navigation graph edges
get_character_state(characterId, lod)       → state at the requested LOD level
get_character_relationships(characterId)    → full relational graph
get_objects_in_location(locationId)         → all objects + placement + state
get_active_narrative_hooks(storyId)         → threads in motion + pressure values
```

### READ — Layer 2 (on demand, specific inspections)
```
get_object_detail(objectId)                 → full state + movement log + canon flags
get_relationship_between(charA, charB)      → specific edge + event history
get_character_event_log(characterId, range) → episodic log for a story-day
get_container_contents(objectId)            → inventory of a container object
get_canon_fact(factId)                      → canonical fact + provenance + locked status
```

### READ — Layer 3 (semantic, rare)
```
search_memories_semantic(query, charId, k)  → top-K vector similarity results
get_memory_chain(memoryId)                  → traverse backwards via previousMemoryId
get_historical_events(filters)              → archive query with tags + time range
```

### WRITE — World Agent only
```
commit_state_diff(diff: StateDiff)          → batch write of extracted entities/facts
move_object(objectId, actorId, toLocation)  → log movement with actor + time
update_relationship(charA, charB, delta)    → adjust edge weights
update_character_volatile(charId, state)    → mood/fatigue/stress delta
lock_canon_fact(factId)                     → promote inferred → canonical
create_entity(type, lod, seed)              → new char/location/object at LOD 0
promote_lod(characterId, targetLod)         → expand character to higher fidelity
fire_event(event: WorldEvent)               → commit world-initiated event to canon
update_narrative_pressure(threadId, delta)  → adjust pressure value
```

### BACKGROUND (async processes call these)
```
extract_from_exchange(turns)                → Information Extractor output (StateDiff)
compact_segment(turnRange)                  → Memory Compactor → MemoryRecord
embed_text(text)                            → vector via Ollama nomic-embed-text
validate_canon_proposal(fact)               → conflict check against locked facts
run_consistency_check(sceneId)              → Consistency Checker audit report
simulate_offscreen(charId, timeRange)       → Simulation Engine run
reconstruct_recent_past(charId)             → plausible "day so far" for a character
check_event_triggers(storyId)               → evaluate all trigger categories (§8.1)
```

### GENERATION (LLM-to-LLM calls, skills layer)
```
generate_scene_description(context)         → Narrator Agent call
generate_character_dialogue(charId, context)→ Character Agent call
generate_entity_detail(entityId, lod)       → LOD expansion on demand
generate_speech_profile(charId)             → derive from biographical layer
generate_story_scaffold(seed)               → world from minimal input
```

That's **~40 tools** across the layers. The batching constraint from §12.3 means Layer 1 and Layer 2 tools should accept arrays, not single items — one call returns all requested items, not one call per item.

---

## The MCP Server Shape

```
nostools/
├── server.ts              # MCP server entry, registers all tool definitions
├── tools/
│   ├── read-layer1.ts     # Scene brief, location, character, objects
│   ├── read-layer2.ts     # Object detail, relationship detail, event log
│   ├── read-layer3.ts     # Semantic search, memory chain, archive
│   ├── write.ts           # World Agent write tools only
│   ├── background.ts      # Extractor, compactor, simulator tools
│   └── generation.ts      # LLM-to-LLM generation tools
└── permissions.ts         # Which agent gets which tool subset
```

The permission layer in `permissions.ts` is what enforces the single most important architectural constraint from NOS: only the World Agent can call tools in `write.ts`. Every other agent gets a filtered view of the tool set at connection time.

You've identified something real. Claude Code's tool set has two distinct layers — and NOS needs both.

---

## The Two Tool Layers

What you're observing is that Claude Code has:

**Domain tools** — what it does  
`Read, Write, Edit, Grep, Glob, Bash` — operate on files and code

**Meta-tools** — how it operates as a system  
`Agent, SendMessage, ToolSearch, Skill, TaskCreate/Get/Update, AskUserQuestion, EnterPlanMode, CronCreate, ScheduleWakeup, EnterWorktree`

NOS needs both layers too. The ~40 domain tools I listed last time are the first layer. The second layer is what makes a multi-agent system actually function.

---

## NOS Meta-Tools

### Agent Coordination (analogous to Agent + SendMessage)
```
spawn_agent(role, context, tools)        → create World/Character/Narrator instance
send_to_world_agent(proposal)            → submit proposal for validation + commit
broadcast_state_change(diff)             → notify all active agents of committed state
get_agent_result(agentId)                → retrieve async agent output
```
The World Agent is the only one that can commit state — but other agents need a way to submit proposals to it. `send_to_world_agent` is the enforcement point.

### Tool Discovery (analogous to ToolSearch)
```
list_tools(agentRole)                    → what tools am I permitted to call?
describe_tool(toolName)                  → full schema on demand (deferred loading)
list_skills()                            → available composed skills
```
This is directly applicable to NOS: you don't load all 40+ tool schemas into every agent's context at once. Character Agents get read-layer1 schemas pre-loaded, and can call `describe_tool` to lazy-load layer 2/3 schemas only when they need them. Keeps the tool overhead from eating context budget.

### Task Management (analogous to TaskCreate/Update/Get)
```
queue_background_task(type, params)      → schedule extraction, compaction, simulation
get_task_status(taskId)                  → poll async work
cancel_task(taskId)                      → abort a background process
list_pending_tasks(storyId)              → see what's queued
```
The NOS has three async background systems (Extractor, Compactor, Consistency Checker). Without task management tools, you have no way for the World Agent to know what's running, what's done, or what to wait for before starting a scene.

### Resource Access (analogous to Read MCP Resources)
```
get_prompt_template(name)                → fetch a reusable prompt from the library
get_canon_snapshot(storyId)              → read-only view of all locked facts
get_narrative_context_packet(sceneId)    → pre-assembled Layer 0 brief (read cache)
```

### Session/Mode Control (analogous to EnterPlanMode, AskUserQuestion)
```
get_player_power_mode()                  → simulation | collaborative | author
request_canon_decision(conflict)         → surface contradiction to player (§15.2)
request_player_clarification(ambiguity)  → ask player to resolve something
set_narrative_pressure(threadId, value)  → World Agent adjusts story tension
```
`request_canon_decision` is the NOS equivalent of `AskUserQuestion` — it surfaces a Severe consistency conflict to the player for resolution rather than the engine guessing.

### Scheduling (analogous to CronCreate + ScheduleWakeup)
```
schedule_event(trigger: ScheduledTrigger)    → register a probability-drift trigger
schedule_simulation_pass(charId, interval)   → recurring off-screen behaviour update  
cancel_scheduled_event(triggerId)
list_active_triggers(storyId)
```
The random event system (§8.1) has three trigger categories — Scheduled, Probability Drift, Reactive. Scheduled triggers need to fire at a story-time interval. Without scheduling tools, these are impossible to implement cleanly.

---

## Realistic Tool Count

```
Domain tools (what NOS does):
  Read Layer 1          7
  Read Layer 2          5
  Read Layer 3          3
  Write (World Agent)   9
  Background processes  8
  Generation/skills     6
  Subtotal             38

Meta-tools (how NOS operates):
  Agent coordination    4
  Tool discovery        3
  Task management       4
  Resource access       3
  Session/mode control  5
  Scheduling            4
  Subtotal             23

Total                  ~61
```

61 is realistic for a system of this complexity. Claude Code lands in a similar range (31 visible + dynamically loaded MCP tools on top).

---

## The Deferred Loading Pattern Is Critical

Claude Code uses `ToolSearch` + deferred loading specifically because you can't put 60 tool schemas in every agent's context — each schema is 200–500 tokens and you'd burn 15–30k tokens before any generation happens.

The NOS pattern should be the same:

```
Character Agent context at turn start:
  Pre-loaded: Layer 1 read tools (7 schemas × ~300 tokens = ~2k tokens)
  Deferred:   Layer 2/3 tools, write tools, scheduling tools
  
World Agent context at turn start:
  Pre-loaded: Write tools + Layer 1 read tools (~5k tokens)
  Deferred:   Layer 2/3, scheduling, generation tools

Narrator Agent context at turn start:
  Pre-loaded: get_scene_brief, get_character_state, get_narrative_context_packet
  Deferred:   everything else (Narrator rarely needs more than Layer 0/1)
```

When a Character Agent needs a Layer 3 memory search it calls `describe_tool("search_memories_semantic")`, gets the schema back, then makes the actual call. One extra round-trip but the context stays lean for 95% of turns where it's not needed.

The same principle applies to skills — they're not loaded until invoked. `list_skills()` returns names + one-line descriptions. `invoke_skill("reconstruct_recent_past", params)` loads and runs it. This is exactly how Claude Code's `Skill` tool works.