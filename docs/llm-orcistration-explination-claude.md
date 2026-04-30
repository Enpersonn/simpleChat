## The Core Problem: Context Windows Are Finite

A 300-page book is ~150,000 tokens. Claude's window is 200k, GPT-4's is 128k, and most local Ollama models are 4k–32k. Even when the window is large enough, **more context = more noise = worse extraction quality**. You don't want to send the whole book — you want to send the right slice.

So all serious extraction architecture answers the same question: **how do you decide what goes into the context window?**

---

## The Three Main Architectural Patterns

### 1. Map-Reduce

The oldest and most reliable pattern. Used heavily in LangChain, early Codex pipelines, and your own `extraction.ts` already uses a variant of this.

```
Input text
    │
    ▼
[Split into chunks]  ← structural boundaries preferred (scenes, chapters)
    │
    ├── chunk 1 ──→ LLM call → partial extraction result
    ├── chunk 2 ──→ LLM call → partial extraction result
    ├── chunk 3 ──→ LLM call → partial extraction result
    │
    ▼
[Reduce: merge all partial results]  ← one more LLM call or deterministic merge
    │
    ▼
Final unified output
```

**Map phase:** Each LLM call only sees one chunk. Prompt: *"Extract all characters and locations that appear in this passage. Output JSON."*

**Reduce phase:** Feed all partial JSON results into one call: *"These are extractions from sequential scenes of the same story. Merge them: deduplicate by name, consolidate traits, resolve aliases ('she', 'the woman', 'mistress' → Alice)."*

**Why it works for a book:** Chunks are small → LLM focus is sharp → quality is high per chunk. The reduce step handles cross-chunk consistency.

**Where it breaks:** The reduce step can get large if there are hundreds of chunks. You can chain reduces: reduce pairs → reduce pairs of reduced pairs (tree reduction).

---

### 2. Retrieve-Then-Generate (RAG)

Used by GitHub Copilot, Claude Code, most modern code assistants. Instead of processing everything upfront, you **index** the content and **retrieve** only what's relevant to the current query.

```
INDEXING (done once, offline):
    Document
        │
        ▼
    [Chunk + embed each chunk]
        │
        ▼
    Vector store (each chunk → dense vector)

QUERY TIME:
    "Tell me about Alice's relationship with her father"
        │
        ▼
    [Embed the query]
        │
        ▼
    [Nearest-neighbor search in vector store]
        │
        ▼
    Top-K relevant chunks retrieved
        │
        ▼
    [LLM call with: query + retrieved chunks]
        │
        ▼
    Answer
```

**Embedding** converts text into a vector where semantic similarity = geometric proximity. "Wings" and "true form" end up near each other in vector space even if the words are different.

**This is what Claude Code does with your codebase.** It doesn't load every file — it has Grep and Glob to find the relevant file, then Read to load only that. The orchestration layer (the agent loop) decides what to retrieve based on what the task needs.

**GitHub Copilot** extends this: it embeds your open files, recent files, imported modules, and uses cosine similarity to decide what to put in context for the current completion.

---

### 3. Agentic / Tool-Use Loops

The pattern behind Claude Code specifically. Instead of pre-deciding what to retrieve, the **model itself calls tools to pull in what it needs dynamically**.

```
Task: "Extract all characters from this book"
    │
    ▼
Agent loop begins:
    │
    ├── Think: "I need to find scene boundaries first"
    ├── Tool call: search_text(pattern="—.*—")  → returns scene headers
    │
    ├── Think: "I'll process scene 1 first"
    ├── Tool call: read_chunk(start=0, end=500) → returns text
    ├── Think: "Alice appears here. She's a succubus. Note it."
    │
    ├── Tool call: read_chunk(start=500, end=1000) → returns text
    ├── Think: "Alex appears. He's human but later revealed as Michael."
    │
    ├── ... continues until all chunks processed
    │
    ├── Think: "Now merge: Alice + Alex + Vireath + Lucifer..."
    ├── Tool call: write_result(entities=[...])
    │
    ▼
Done
```

The model drives the loop. It decides what to read next based on what it's already found. This is fundamentally different from map-reduce where the orchestrator controls the flow.

**This is expensive** (many round trips) but produces the highest quality output because the model can follow threads: "Alice is mentioned as Lucifer's daughter in scene 8 — let me go back and re-read scene 1 knowing that."

---

## How These Patterns Combine In Practice

Real systems layer all three:

```
Large book input
    │
    ▼
[1. Structural pre-processing]  ← deterministic, no LLM needed
    Split on headers, chapter markers, scene breaks
    Result: N chunks with metadata (position, header label)
    │
    ▼
[2. Map: per-chunk entity extraction]  ← parallel LLM calls
    Cheap, fast, low temperature
    Result: N partial entity lists (JSON)
    │
    ▼
[3. Reduce: entity resolution]  ← one LLM call
    Merge duplicates, normalize names, resolve pronouns
    Result: Canonical entity list
    │
    ▼
[4. RAG: entity enrichment]  ← one LLM call per entity
    For each entity, retrieve only chunks where they appear
    Ask: "Given these passages, what are Alice's full traits, arc, relationships?"
    Result: Rich entity profiles
    │
    ▼
[5. Graph construction]  ← deterministic or one final LLM call
    Nodes = entities, edges = relationships
    Result: Entity graph stored for retrieval
```

---

## What This Means For SimpleChat's Parse Pipeline

Your current `POST /stories/parse-text` takes text and does one LLM call. For a short story that's fine. For a book, you'd need to evolve to:

**Stage 1 — Structural pre-processing (zero LLM cost)**
Your demo story has explicit `—Scene name—` headers. A simple regex splits it into scenes. For a real book: split on chapters, then paragraphs. Store `{ text, position, header }` per chunk. This is free and gives you the scaffold everything else hangs on.

**Stage 2 — Map extraction (parallel, cheap)**
One LLM call per chunk, temperature 0.1, tiny prompt:
```
"List characters and locations mentioned. Output: { characters: [{name, aliases}], locations: [{name}] }"
```
Don't ask for traits yet — just presence. This is a detection pass, not a profiling pass.

**Stage 3 — Entity resolution (one call)**
Feed all the name lists from stage 2 into one call:
```
"These are character mentions from sequential scenes. Merge duplicates, resolve aliases. Alice = 'she' = 'mistress' = 'the woman'. Output canonical list."
```

**Stage 4 — Enrichment with targeted retrieval (parallel, per entity)**
For each canonical entity, go back to your chunks and collect only the ones where that entity appears (simple string match on their name/aliases). Send only those chunks + the entity name to the LLM and ask for full profile. Alice's enrichment call gets maybe 4 scenes — not the full book.

**Stage 5 — Relationship extraction (one call)**
Now that you have canonical entities, extract the relationship graph. Feed entity list + key scene excerpts, ask for edges.

---

## The Specific Thing That Would Help Your Memory Retrieval

Your current `findRelevantMemories()` does: tags-first → LLM fallback. That's sparse retrieval (tags) with LLM as a reranker. It works.

The upgrade would be adding **dense retrieval** via embeddings as a middle layer:

```
Current:  tags → [gap] → LLM fallback
Upgraded: tags → embedding similarity → LLM reranker
```

Ollama can generate embeddings (`/api/embeddings`). When a memory is created, embed the summary and store the vector. At retrieval time, embed the recent turns and do cosine similarity. This catches semantically related memories that share no tags — *"fear of rejection"* retrieves *"Alice hiding her true form"* even if the tags don't overlap.

For a local tool like SimpleChat, this doesn't require a vector database — a flat JSON array of `{id, vector}` with a dot-product scan is fast enough up to a few thousand memories per character.