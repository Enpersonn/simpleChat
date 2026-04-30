## What Happens Inside the Model During Extraction

### 1. Tokenization → Contextual Embeddings

The text doesn't get read like a human reads. It gets broken into subword tokens (roughly 3–4 characters each), then each token gets a vector representation. The key thing: these vectors are **not static** — they're contextually shaped by every other token in the window via attention.

So when the model reads "Alice", its representation of that token is already being influenced by "succubus", "wings", "true form", "enchantment" — everything co-occurring with her in context.

### 2. Attention = Implicit Entity Graphs

The transformer's multi-head attention mechanism is essentially building a soft graph of relationships between all token positions simultaneously. This is why the model can:

- Resolve "she" back to Alice across paragraphs without explicit coreference rules
- Know that "the man" who was "unfazed" is Alex even before his name appears
- Associate "red wings" and "claws in the snow" with Alice's true form even though they're in different scenes

**The model never "scans for keywords."** It holds the entire context as a weighted relational matrix and reasons over it holistically.

### 3. Pattern Matching Against Training Distribution

Through training on vast text, the model has internalized patterns like:
- *"Character introduction looks like: name + description + action + reaction from others"*
- *"Location description looks like: sensory details + spatial arrangement + atmosphere"*
- *"Theme emergence looks like: repeated motif across scenes + character arc resolution"*

When you ask it to extract characters from the demo story, it's matching the text against those learned patterns. It doesn't compute rules — it recalls statistical structure.

---

## What This Means For Your Extraction Prompts

The gap between a good and bad extraction comes down to **how well your prompt activates the right internal patterns**. A few concrete things:

### Specificity collapses ambiguity

```
Bad:  "Extract characters from this text"
Good: "Extract each named character. For each one, return:
       - name
       - apparent nature (human/demon/angel/other)
       - key traits shown through behavior
       - relationships to other characters
       - any revealed secrets or hidden truths"
```

The second prompt forces the model to make explicit what it already implicitly knows — it just needed to know *which* parts of its internal representation to surface.

### Schema-first prompting anchors output structure

When you provide a target JSON schema in the prompt, the model generates into that structure rather than inventing one. This is especially important for Zod validation — the closer your prompt schema mirrors your Zod schema, the fewer parse failures you'll see.

```
Current pattern in your codebase:
  "return JSON with fields X, Y, Z"

Better:
  Paste the actual schema shape as a commented JSON example in the prompt
  The model will use it as a template, not just a description
```

### Coreference is free — use it

The model automatically resolves pronouns and aliases. You don't need to pre-process the text to resolve "she" → Alice. But what you *can* do is explicitly ask the model to normalize names in output:

```
"Use the most common name for each character consistently in output, 
 even if they're referred to by pronoun or title in some passages."
```

This collapses "Alice", "she", "the woman", "mistress" into one entity in the output.

### Implicit facts are accessible — but only if asked

From the demo story, the model can infer:
- Alice is Lucifer's daughter (stated in the vision section)
- Alex is the reincarnation of Michael (stated in the runes scene)
- Vireath is a demon loyal to Alice (inferred from behavior + address)

**But the model won't surface implicit facts unless you ask for them.** Adding a prompt field like `"inferredTraits": []` alongside `"explicitTraits": []` would get you significantly richer character profiles than just what's stated directly.

---

## Concrete Improvements to Your Parse Pipeline

Looking at your current architecture (`POST /stories/parse-text` in `stories.ts`):

**Multi-pass extraction** would be a major win. Right now you're likely doing a single LLM call. Consider splitting into:

1. **Pass 1 — Entity discovery** (temp 0.1): Extract names, classify entity type (character/location/faction), note scene appearances. This is cheap and high-confidence.

2. **Pass 2 — Entity enrichment** (temp 0.2): For each discovered entity, do a focused call with the entity name + relevant excerpts (not the full text). Ask for traits, relationships, arcs. Smaller context = less noise.

3. **Pass 3 — Relationship mapping** (temp 0.1): Given the entity list from passes 1–2, extract edges: `{from, to, type, evidence}`. The model is very good at this when entities are already disambiguated.

**Why this matters for your schemas:** Your `CharacterSchema` has `relationships[]`, `private{}`, `public{}` — these map naturally to pass 2/3 outputs. But cramming all of it into one prompt means the model has to simultaneously do entity detection AND deep profiling AND relationship mapping AND output structuring. Errors compound.

**Text chunking for long inputs:** For texts longer than ~2000 tokens, split on scene boundaries (your demo story already has scene headers like `—Scene Alice accidentally reveals her true form—`). Run entity extraction per chunk, then merge by name normalization. The model's attention degrades for entities mentioned only in distant parts of a long context.

**Confidence as a field:** Ask the model to include a `confidence: "high" | "medium" | "low"` on extracted fields. Then in your Zod schema, treat `low` confidence fields as optional overrides rather than core data. This surfaces what the model is uncertain about rather than hallucinating into gaps.

---

## The Core Insight For SimpleChat

The model's internal representation of your story text is already a rich entity graph with relationships, traits, temporal arcs, and themes — it builds that automatically. **Your extraction prompt is just an API into that representation.** The more precisely your prompt specifies what slice of that graph you want, and in what shape, the more faithfully the output mirrors what the model actually "knows" from reading the text.

The biggest gains for your parse agents will come from: (1) splitting single large extraction prompts into focused multi-pass calls, and (2) matching your prompt output schema exactly to your Zod schemas so parse failures drop to near zero.