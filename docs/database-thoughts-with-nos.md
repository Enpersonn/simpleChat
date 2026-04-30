Read the full 22 pages. This document is excellent — the architecture is well-reasoned and the core principle ("LLM proposes, never commits, programmatic systems own truth") solves exactly the right problem. Let me address your question properly.

---

## On The Database Question

Yes, you need a real database at this scale. The NOS doc recommends SQLite + ChromaDB, but given your Docker intention and Daggerfall/LOTR-scale ambitions, **PostgreSQL + pgvector is the stronger choice**:

|                                               | SQLite + Chroma      | PostgreSQL + pgvector |
| --------------------------------------------- | -------------------- | --------------------- |
| Two database processes to synchronize         | Yes                  | No — one DB does both |
| Hybrid queries (structured + semantic in one) | No                   | Yes                   |
| Concurrent async agent writes                 | Fragile              | Handles it natively   |
| Scale ceiling                                 | ~10M rows, struggles | Effectively unlimited |
| Docker complexity                             | Two containers       | One container         |

The key pgvector advantage for NOS specifically is **hybrid queries** — the memory retrieval described in §12 can be expressed in a single SQL statement:

```sql
SELECT id, factual_summary, emotional_summary, importance
FROM memory_records
WHERE story_id = $1 AND character_id = $2
  AND importance >= 0.8
   OR (embedding <=> $3) < 0.3   -- semantic similarity threshold
ORDER BY importance DESC, embedding <=> $3
LIMIT 8;
```

That single query replaces what would otherwise require a Chroma call + a Postgres call + a merge step. The NOS doc was written before pgvector reached its current maturity — it's the right call now.

---

## How Your Three Pillars Map To NOS

You identified the right three. Here's how they actually fit in the full pipeline from §16:

### RAG → The Four-Layer Hierarchy (§12)

The NOS doesn't treat RAG as a single operation — it stratifies it:

```
Layer 0  — always present, pre-assembled after previous turn ends
           ~300-500 tokens, no retrieval cost on critical path

Layer 1  — structured DB queries, most turns
           room contents, character summaries, relationship edges

Layer 2  — structured DB queries, on demand
           specific object state, one character's full history with another

Layer 3  — vector similarity search (pgvector) ← this is "RAG" proper
           semantic memory retrieval, deep history, archive
           pre-run asynchronously so it's ready before the player acts
```

The Memory Compactor (§14) is what *feeds* the RAG index — it converts raw transcript into structured, embedded memory records. Without it, RAG degrades over time because the index fills with noise. With it, older events become *more* retrievable, not less.

### Tool Calls → Context Expansion On Demand (§12.3)

The architecture inverts the typical "stuff everything in context" approach. The LLM starts with Layer 0 only, then requests what it needs:

```
Turn arrives
  → LLM receives Layer 0 (scene brief, 300-500 tokens)
  → LLM decides: do I need more?
      → If yes: submits batched tool call list (not one per item — all at once)
      → Layer 1/2/3 retrieved, returned in one response
      → LLM completes generation
  → World Agent validates proposals
  → State committed
```

The **batching rule** in §12.3 is critical for performance — every round-trip costs 5–15s of LLM latency. Designing the tool call API to only accept lists, never single items, enforces this. You'd build this as:

```ts
// Not this:
tool: get_character_state(charId: string)
tool: get_room_contents(locationId: string)

// This:
tool: get_context_batch(requests: ContextRequest[])
// Returns all results in one call
```

### Multi-Pass → The Agent Split (§3.1)

The NOS has three distinct LLM call types per turn, each with a different role and a different context window:

```
Pass 1 — Character Agents (one per LOD 3 character)
          Input: that character's full state + scene brief
          Output: proposed dialogue and behaviour
          Write access: none

Pass 2 — Narrator Agent
          Input: validated character proposals + full scene context
          Output: rendered prose, scene description, internal monologue
          Write access: none

Pass 3 — Information Extractor (async, after output delivered)
          Input: completed exchange transcript
          Output: structured diff (entities, facts, events, objects)
          Write access: via World Agent only
```

The **World Agent** is the orchestrator — it assembles context packets, routes proposals, validates against canon, and is the sole writer to state. This is the most architecturally important constraint in the document.

---

## The Evolution Path From SimpleChat → NOS

SimpleChat as it exists today is essentially **step 4 of the build order in §19** — a single Narrator LLM call with a context packet. That's intentional and correct. The document's build order maps cleanly to what you'd add next:

```
Current SimpleChat
  = Step 4: Narrator LLM + assembled context

Next logical steps:
  Step 5: Tool call layer
          → LLM requests more context via tool calls
          → Layer 1 retrieval (room, character summaries)
          → This is mostly wiring, your context.ts is already structured for it

  Step 6: Information Extractor
          → extraction.ts already exists for location changes
          → Expand to track: people, objects, facts, events (§13.1)
          → The canonical diff model is the big addition

  Step 7: PostgreSQL + pgvector migration
          → Replace JSON files with structured tables
          → Add memory_records table with embedding column
          → nomic-embed-text via Ollama for embeddings

  Step 8: Memory Compactor
          → Triggered on scene transitions (you already detect these)
          → Converts old turns into structured memory records
          → Embeds and stores in pgvector

  Step 9: Character Agent split
          → LOD 3 characters get their own LLM call
          → Their output is proposals, not committed dialogue
          → World Agent validates before Narrator renders

  Steps 10-13: World Agent, Simulation Engine,
               Random Events, Consistency Checker
               → These are the "world has its own agenda" features
               → The random event system (§8) is the most novel piece
```

---

## The One Thing To Lock In Now

Before any of those steps, the architectural decision that will make or break everything at scale is **canon provenance tagging** (§11, §13.2). Every fact in the system needs to carry: `authored | observed | simulated | inferred | unresolved`.

This doesn't require a database migration — it can be added to your existing JSON schema now as a field on stories, characters, memories. But retrofitting it later is painful because it needs to be present on *everything* for the Consistency Checker and World Agent to function correctly.

The five-tag provenance system is what separates "the LLM said something once" from "this is a canonical fact the engine will defend." That distinction is the whole game at LOTR scale.