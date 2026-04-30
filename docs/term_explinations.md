Good question. Let me go through each term grounded in things you already know from regular code.

---

## Tool

**What it is:** A regular function. Deterministic. No LLM. Takes input, returns output.

**Code analogy:** Any function in `storage.ts`. `listCharacters(storyId)` takes an ID, reads a file, returns data. No surprises.

**The LLM connection:** When an agent needs information, it can't just read a variable — it has to *request* it through a tool call. The LLM outputs something like `{ "tool": "listCharacters", "args": { "storyId": "abc" } }`, your code intercepts that, runs the actual function, and feeds the result back to the LLM. The LLM never touches the database directly — it asks, your code fetches.

**In SimpleChat right now:** All of `storage.ts`, `streamChat()`, `assembleContext()` are tools in everything but name. They're just called directly by your code instead of by an LLM.

---

## PromptRunner (currently `LLMAgent`)

**What it is:** A configured LLM call factory. One instance = one prompt configuration. You call it with input, it returns structured JSON.

**Code analogy:** `axios.create({ baseURL, headers })`. You configure it once with defaults, then call it repeatedly with different payloads. Or think of it as a class constructor that bakes in a system prompt — `new PromptRunner({ role, instructions, outputShape })` gives you a ready-to-use caller.

**What it is NOT:** An agent. It has no loop. It makes exactly one LLM call per `.run()` invocation and returns. It can't call tools. It can't decide to do anything differently based on what it finds.

**In SimpleChat right now:** `censusAgent`, `characterDeepDiveAgent`, `storyCharactersAgent` — all of these are `PromptRunner` instances with different system prompt configurations. The name `LLMAgent` is misleading. There's nothing agent-like about them.

---

## Skill (Paths, Chains) 

**What it is:** A multi-step workflow that composes PromptRunners and Tools in a fixed, code-controlled sequence.

**Code analogy:** A service function. Like `createOrder()` in an e-commerce backend — it validates input, calls the inventory service, charges the card, sends an email. The code decides the order. Each step might succeed or fail. The function orchestrates it all. There's no loop, no decision-making — the sequence is hardcoded.

**In SimpleChat right now:** `parseStoryMultiPass()` is the best example. It runs 7 passes in a fixed order: census → story core → locations → per-character deep dive → relationships → timeline → identity resolution. The code drives every step. The LLM within each step just does its narrow job.

`findRelevantMemories()` is also a skill: always-include filter → tag scoring → LLM fallback. Three steps, code-controlled order.

**The key distinction vs. an Agent:** In a skill, *your code* decides "now run step 3." In an agent, *the LLM* decides "I need to call tool X before I can continue."

---

## Agent

**What it is:** A reasoning loop where the LLM itself decides what to do next.

**Code analogy:** An event loop with the LLM as the state machine driver. Or think of a REPL — the program keeps running, waiting for input, acting on it, waiting again. Except here the "input" after each action is the result of whatever tool the LLM just called.

**The loop looks like this:**
```
LLM receives task
  → LLM thinks: "I need to know what characters exist"
  → LLM emits: tool_call("listCharacters", { storyId })
  → Your code runs listCharacters, returns result
  → LLM receives result, thinks again
  → LLM: "OK, now I need Alice's memories"
  → LLM emits: tool_call("listMemories", { charId: "alice" })
  → Your code runs listMemories, returns result
  → LLM: "I have enough context, here is my response"
  → Loop ends
```

The LLM controls when it has enough information. Your code just routes tool calls and feeds results back. The flow is not hardcoded.

**In SimpleChat right now:** Nothing. The DM Chat would be the first one — it needs to read story state and propose writes, and the LLM should decide *what* to read based on *what the user asked*.

---

## Embedding

**What it is:** A function that converts text into an array of numbers (a vector) where the numbers capture *meaning*, not just characters.

**Code analogy:** Like a hash function, but instead of making similar inputs look different (which is what a cryptographic hash does), it makes similar meanings look similar. Two pieces of text that mean the same thing will produce vectors that are close together in space. Two pieces of text that mean different things will produce vectors that are far apart.

```
"Alice is afraid of being seen as a monster"  → [0.2, -0.8, 0.4, 0.1, ...]  (768 numbers)
"Alice hides her true nature out of shame"    → [0.19, -0.79, 0.41, 0.09, ...] ← very close
"The location has a stone fireplace"          → [-0.6, 0.3, -0.1, 0.7, ...]   ← far away
```

**Why it matters:** Tag matching only finds memories that share exact keyword tags. Embedding lets you find memories that are *semantically related* even if they use completely different words. "fear of rejection" finds "Alice hiding her true form" because the meaning overlaps, not the words.

**In SimpleChat's plan:** `nomic-embed-text` via Ollama generates these. Every time a memory is created, you embed its summary and store the vector. At retrieval time, embed the current conversation and find the closest memories by vector distance.

---

## RAG (Retrieval Augmented Generation)

**What it is:** Using embedding similarity to decide what context to put in the LLM's prompt.

**Code analogy:** `grep`, but for meaning instead of text patterns. Or: a smart cache that fetches documents based on semantic relevance to the current query instead of exact key lookups.

**The pattern:**
```
1. At write time: embed each memory summary, store vector
2. At query time: embed the current scene/conversation
3. Find the top-K memories whose vectors are closest to the query vector
4. Put those memories into the LLM's context
```

**In SimpleChat right now:** `findRelevantMemories()` does a primitive version of this with tags and an LLM fallback — but no embeddings. Adding `nomic-embed-text` would make step 3 much more accurate.

---

## Context Window

**What it is:** The LLM's working memory. It can only "see" a fixed amount of text at once (measured in tokens, roughly ¾ of a word each).

**Code analogy:** A function's parameter list. You can only pass so much before performance degrades or you hit a hard limit. Everything the LLM knows about the current task has to fit in this window.

**Why it matters for orchestration:** This is the fundamental constraint that forces all the architecture above to exist. If the window were infinite, you'd just dump everything in and be done. Because it's finite, you need tools (to fetch only what's needed), skills (to process large inputs in chunks), and RAG (to retrieve only the relevant slice).

---

## How They Stack in SimpleChat

```
streamChat()          ← Tool (calls Ollama API, atomic)
assembleContext()     ← Tool (pure function, builds text)
storage.*             ← Tools (file CRUD, atomic)

censusPrompt          ← PromptRunner (configured single LLM call)
characterDeepDivePrompt ← PromptRunner

findRelevantMemories()  ← Skill (3-stage retrieval pipeline)
parseStoryMultiPass()   ← Skill (7-stage extraction pipeline)
runExtraction()         ← Skill (post-turn state detection)

DM Chat agent         ← Agent (MISSING — first one to build)
Narrator agent        ← Agent (MISSING — further out)
```

The only missing layer is the agent loop itself — everything below it already exists, it just hasn't been wired together in a way where the LLM drives the tool calls.