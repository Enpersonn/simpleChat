import type { MemoryItem, Turn } from "@simplechat/types";
import { streamChat } from "./ollama.js";

export type MemoryReason = "always_include" | "tag_match" | "llm_picked";

export interface MemoryWithReason {
  memory: MemoryItem;
  reason: MemoryReason;
  score?: number;
}

export interface RelevantMemoryResult {
  memories: MemoryItem[];
  reasons: Record<string, MemoryReason>;
  details: MemoryWithReason[];
  llmFallbackFired: boolean;
}

function extractKeywords(turns: Turn[]): Set<string> {
  const text = turns
    .slice(-5)
    .map((t) => t.text.toLowerCase())
    .join(" ");
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "is",
    "was",
    "are",
    "were",
    "i",
    "you",
    "he",
    "she",
    "it",
    "we",
    "they",
    "that",
    "this",
    "have",
    "had",
    "has",
    "do",
    "did",
    "not",
    "be",
    "been",
  ]);
  return new Set(
    text.split(/\W+/).filter((w) => w.length > 3 && !stopWords.has(w)),
  );
}

function scoreByTags(memory: MemoryItem, keywords: Set<string>): number {
  return memory.tags.filter((tag) => keywords.has(tag.toLowerCase())).length;
}

export async function findRelevantMemories(
  memories: MemoryItem[],
  recentTurns?: Turn[],
  maxResults = 5,
): Promise<RelevantMemoryResult> {
  if (memories.length === 0) {
    return { memories: [], reasons: {}, details: [], llmFallbackFired: false };
  }

  const alwaysInclude = memories.filter((m) => m.importance >= 0.8);
  const alwaysIds = new Set(alwaysInclude.map((m) => m.id));
  const alwaysDetails: MemoryWithReason[] = alwaysInclude.map((m) => ({
    memory: m,
    reason: "always_include",
  }));

  const keywords = recentTurns && extractKeywords(recentTurns);
  const tagMatchDetails: MemoryWithReason[] = memories
    .filter((m) => !alwaysIds.has(m.id))
    .map((m) => ({
      memory: m,
      reason: "tag_match" as MemoryReason,
      score: scoreByTags(m, keywords!),
    }))
    .filter((x) => x.score! >= 1)
    .sort((a, b) => b.score! - a.score!);

  const combined = [...alwaysDetails, ...tagMatchDetails];
  if (combined.length >= maxResults) {
    const sliced = combined.slice(0, maxResults);
    const reasons: Record<string, MemoryReason> = {};
    for (const d of sliced) reasons[d.memory.id] = d.reason;
    return {
      memories: sliced.map((d) => d.memory),
      reasons,
      details: sliced,
      llmFallbackFired: false,
    };
  }

  const combinedIds = new Set(combined.map((d) => d.memory.id));
  const remaining = memories.filter((m) => !combinedIds.has(m.id));
  if (remaining.length === 0) {
    const reasons: Record<string, MemoryReason> = {};
    for (const d of combined) reasons[d.memory.id] = d.reason;
    return {
      memories: combined.map((d) => d.memory).slice(0, maxResults),
      reasons,
      details: combined.slice(0, maxResults),
      llmFallbackFired: false,
    };
  }

  const needed = maxResults - combined.length;
  const contextText = recentTurns
    ?.slice(-3)
    .map((t) => `${t.role}: ${t.text}`)
    .join("\n");
  const memoryList = remaining
    .map(
      (m) =>
        `{"id":"${m.id}","summary":${JSON.stringify(m.summary)},"tags":${JSON.stringify(m.tags)}}`,
    )
    .join("\n");

  let raw = "";
  let llmFallbackFired = false;
  try {
    await streamChat({
      messages: [
        {
          role: "system",
          content:
            "You are a memory relevance filter. Return ONLY a JSON array of memory IDs (strings) that are relevant to the current scene. Return at most " +
            needed +
            " IDs. If none are relevant, return [].",
        },
        {
          role: "user",
          content: `Current scene:\n${contextText}\n\nAvailable memories:\n${memoryList}`,
        },
      ],
      temperature: 0.1,
      onChunk: (chunk) => {
        raw += chunk;
      },
    });

    llmFallbackFired = true;
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const ids: unknown = JSON.parse((fenced ? fenced[1] : raw).trim());
    if (Array.isArray(ids)) {
      const idSet = new Set(
        ids.filter((x): x is string => typeof x === "string"),
      );
      const llmDetails: MemoryWithReason[] = remaining
        .filter((m) => idSet.has(m.id))
        .slice(0, needed)
        .map((m) => ({ memory: m, reason: "llm_picked" }));

      const allDetails = [...combined, ...llmDetails].slice(0, maxResults);
      const reasons: Record<string, MemoryReason> = {};
      for (const d of allDetails) reasons[d.memory.id] = d.reason;
      return {
        memories: allDetails.map((d) => d.memory),
        reasons,
        details: allDetails,
        llmFallbackFired,
      };
    }
  } catch {
    // LLM call failed — return what tag matching found
  }

  const fallbackDetails = combined.slice(0, maxResults);
  const reasons: Record<string, MemoryReason> = {};
  for (const d of fallbackDetails) reasons[d.memory.id] = d.reason;
  return {
    memories: fallbackDetails.map((d) => d.memory),
    reasons,
    details: fallbackDetails,
    llmFallbackFired,
  };
}
