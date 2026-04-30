Fair point. If the goal is to handle book-scale content and many memories per character, design for that now rather than retrofit later. Let me give you a concrete recommendation.

---

## Which Vector Database Fits SimpleChat

Given your stack (local tool, Node.js, no existing database, files on disk), the options narrow fast:

| Option       | Deployment           | Node.js support | Fits your stack           |
| ------------ | -------------------- | --------------- | ------------------------- |
| **LanceDB**  | Embedded (no server) | Native TS/JS    | Best fit                  |
| **Qdrant**   | Docker container     | REST client     | Good if you want a server |
| **Chroma**   | Python server        | JS client       | Awkward (Python dep)      |
| **pgvector** | PostgreSQL           | pg client       | Overkill, adds DB         |
| **Weaviate** | Docker               | JS client       | Heavy                     |

**Recommendation: LanceDB** — it's embedded (runs inside your Node process, no separate server, stores `.lance` files on disk alongside your JSON), has first-class TypeScript support, and scales to millions of vectors. It fits your existing philosophy of "plain files on disk, no infrastructure."

If you later want a standalone server you can switch to Qdrant without changing your embedding logic — just swap the storage adapter.

---

## What The Architecture Looks Like

```
Current:
  CharacterMemory (JSON) → tags-first → LLM fallback

With vectors:
  CharacterMemory (JSON) ──────────────────────────────────────────┐
  CharacterMemory (LanceDB) ← embedding on create/update           │
                                                                    │
  findRelevantMemories():                                           │
      1. Always-include (importance >= 0.8)           ← unchanged  │
      2. Tag match                                    ← unchanged  │
      3. Semantic search (cosine sim via LanceDB)     ← NEW        │
      4. LLM reranker                                 ← demoted to last resort
                                                                    │
  Source of truth stays in JSON ──────────────────────────────────-┘
  Vector store is an index only, never the source of truth
```

Key design decision: **the JSON files remain the source of truth**. LanceDB holds `{ memoryId, storyId, charId, vector }` only. If the vector store is deleted or corrupted, you rebuild it from the JSON. This keeps your storage layer clean.

---

## Embedding Model

You're already running Ollama — it has an embeddings endpoint (`/api/embeddings`). You'd pull one dedicated embedding model:

```bash
ollama pull nomic-embed-text   # 274MB, 768 dimensions, fast, good quality
```

This keeps everything local and avoids any external API dependency.

---

## What Changes In The Codebase

**New file: `backend/src/vector-store.ts`**
- Init LanceDB table on startup
- `upsertMemoryVector(storyId, charId, memoryId, text)` — embed + store
- `deleteMemoryVector(memoryId)`
- `searchSimilar(storyId, charId, queryText, limit)` → `memoryId[]`

**Modified: `backend/src/memory-retrieval.ts`**
- Add semantic search as step 3
- Results from tag match + semantic search get merged, deduped, then LLM reranker only fires if still under `maxResults`

**Modified: `backend/src/routes/character-memories.ts`**
- After `createCharacterMemory()` → call `upsertMemoryVector()`
- After `updateCharacterMemory()` → call `upsertMemoryVector()`
- After `deleteCharacterMemory()` → call `deleteMemoryVector()`

**Modified: `backend/src/config.ts` or `index.ts`**
- Initialize LanceDB on app startup
- Add `vectorDataDir()` pointing to `data/vectors/`

**Modified: `backend/src/ollama.ts`**
- Add `generateEmbedding(text: string): Promise<number[]>` — calls `/api/embeddings`

**Modified: `packages/types/src/settings.ts`**
- Add `embeddingModel: string` (default `"nomic-embed-text"`) to `AppSettingsSchema`

**New route in `backend/src/routes/settings.ts` or `ollama.ts`**
- `POST /ollama/rebuild-vectors` — utility endpoint to rebuild the vector index from existing JSON memories (needed for migration)

---

## Scale Characteristics

With LanceDB + `nomic-embed-text` (768 dimensions):

| Memories per character | Search latency | Storage |
| ---------------------- | -------------- | ------- |
| 1,000                  | < 5ms          | ~6MB    |
| 10,000                 | < 20ms         | ~60MB   |
| 100,000                | < 100ms        | ~600MB  |

For a collaborative fiction tool, even a very prolific story would have thousands of memories per character at most. You have headroom well beyond practical limits.

---

## The One Tradeoff To Know

The embedding model needs to be consistent. If you embed with `nomic-embed-text` and a user later switches embedding models, all existing vectors are incompatible — the geometry of the vector space is different. You'd need to rebuild.

The clean way to handle this: store which embedding model generated each vector in the LanceDB table (`{ memoryId, embeddingModel, vector, ... }`), and expose that rebuild endpoint so users can migrate when they switch models. This is a known problem in every production RAG system.

---

Want to proceed with implementing this? I'd start with `vector-store.ts` and `ollama.ts` embedding function, then wire into the memory creation routes, then add the retrieval step.