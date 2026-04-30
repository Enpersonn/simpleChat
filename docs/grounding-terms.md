Now I have the full picture. Let me map this out for your project specifically.

---

## The Four Layers — What SimpleChat Has vs. Needs

```
Layer 4 — Agents
  Reasoning loops, own a role, call tools dynamically, drive the flow
  Examples (planned): DM chat agent, Narrator agent, Character agents
  Status: MISSING. Nothing in the codebase qualifies.
                    ↑
Layer 3 — Skills
  Composed multi-step LLM workflows. Code drives the order. No loop.
  Examples (exist): parseStoryMultiPass, findRelevantMemories, runExtraction
  Status: EXISTS but called "agents" / scattered.
                    ↑
Layer 2 — PromptRunners
  Single configured LLM call → structured JSON output.
  Examples (exist): censusAgent, characterDeepDiveAgent, storyCharactersAgent, etc.
  Status: EXISTS but LLMAgent is a misleading name for what it does.
                    ↑
Layer 1 — Tools
  Deterministic, no LLM. Atomic operations.
  Examples (exist): storage.* CRUD, streamChat(), assembleContext()
  Status: EXISTS but not defined as callable tools — just internal functions.
         agents/tools/ was the right idea, it's just empty.
```

The gap is entirely at Layer 4, and the wire between Layer 1 and Layer 4 — **tools as callable interfaces that an agent can invoke dynamically**.

---

## The Right Starting Point: DM Chat

The DM Chat from your ideas doc is not just a feature — it's the natural first true agent in the system. It requires exactly what you're missing:

- It needs to **read** existing story state (`list_characters`, `get_story`, `list_locations`)
- It needs to **propose** writes (`propose_character`, `propose_location`, `propose_memory`)
- It loops: user message → DM thinks → maybe calls tools → responds with prose + proposals → user accepts/rejects → next turn
- The LLM drives what to fetch. The code doesn't pre-decide context.

That's a real agent loop. And it teaches every pattern you need for the Narrator and Character agents later.

---

## What "Starting Small" Actually Looks Like

**Step 1 — Rename `LLMAgent` → `PromptRunner`**  
One change, the foundation is correct before you build on it.

**Step 2 — Define the tool interface** in `agents/tools/`  
Not MCP yet. Just typed functions with a consistent signature:

```ts
interface Tool<TInput, TOutput> {
  name: string;
  description: string;  // this goes in the LLM's prompt
  schema: ZodSchema<TInput>;
  execute(input: TInput): Promise<TOutput>;
}
```

Start with the DM's read tools: `getStory`, `listCharacters`, `listLocations`, `listMemories`. These are just thin wrappers around existing `storage.*` functions — almost zero new code.

**Step 3 — Build the agent loop**  
The DM agent receives a user message, gets a list of available tool schemas injected into its system prompt, calls tools as needed via JSON tool-call responses, then generates a final response. This is the loop the current codebase doesn't have anywhere.

**Step 4 — Add proposal tools**  
`proposeCharacter(data)`, `proposeLocation(data)`, `proposeMemory(data)` — these don't write to disk, they emit a preview frame in the stream. The frontend shows the card; user accepts → actual `storage.create*` is called.

---
● You're right, and that's a genuinely good example of why the naming mess has real costs —
  you had to stop and ask because the same word appeared in two different contexts in the
  same conversation.

  ---
  What Claude Code skills actually are at their core:

  They're named, reusable prompt fragments that get injected into context on demand. Strip
  away the markdown and the slash command interface and that's it — text that gets added to
  the system prompt when invoked.

  ---
  Can SimpleChat have the same thing?

  Yes, and you already have a primitive version of it: mood tags. Each mood tag injects
  writing directives into the system prompt when active. That's the same mechanic as a
  Claude Code skill.

  A more general version would let users define named instruction sets — "gothic horror
  mode", "combat writing", "slow burn romance" — that inject into the prompt when selected.
  More flexible than hardcoded mood tags.

  Whether it's worth building depends on whether your users actually need that level of
  customization beyond what mood tags already give them. It's a real and useful pattern, but
   probably a later feature rather than foundational.

  ---
  On the naming confusion:

  What you experienced is the actual cost of poor standardization. You asked a precise
  question, the answer required distinguishing between two unrelated things with the same
  name, and the conversation got muddier than it needed to be. That friction is real and
  it's why picking unambiguous names in your own codebase — like "path" — is worth doing
  even if it's non-standard. Clarity within your project matters more than matching an
  industry that hasn't agreed on terms yet.

## The concrete question

Do you want to start with the PromptRunner rename + the tool interface definition — those two things together give you the correct foundation and nothing breaks. Then from there, DM Chat is a natural first feature that exercises all four layers.

Or if you'd rather start with the embedding/vector layer (which the RAG plan covers) that's also a valid next step — it's lower in the stack and independent. What's the priority for you right now?

