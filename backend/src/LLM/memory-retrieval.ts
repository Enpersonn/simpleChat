import type { MemoryItem, Turn } from '@simplechat/types';
import { embedText } from './embedding/index.js';
import { streamChat } from './ollama.js';

export type MemoryReason = 'always_include' | 'semantic' | 'tag_match' | 'llm_picked';

export interface MemoryWithReason {
	memory: MemoryItem;
	reason: MemoryReason;
	score?: number;
}

export interface RelevantMemoryResult {
	details: MemoryWithReason[];
	llmFallbackFired: boolean;
	memories: MemoryItem[];
	reasons: Record<string, MemoryReason>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	const len = Math.min(a.length, b.length);
	for (let i = 0; i < len; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	if (normA === 0 || normB === 0) return 0;
	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function extractKeywords(turns: Turn[]): Set<string> {
	const text = turns
		.slice(-5)
		.map((t) => t.text.toLowerCase())
		.join(' ');
	const stopWords = new Set([
		'a', 'an', 'and', 'are', 'at', 'be', 'been', 'but', 'do', 'did',
		'for', 'had', 'has', 'have', 'he', 'i', 'in', 'is', 'it', 'not',
		'of', 'on', 'or', 'she', 'that', 'the', 'they', 'this', 'to',
		'was', 'we', 'were', 'with', 'you',
	]);
	return new Set(
		text.split(/\W+/).filter((w) => w.length > 3 && !stopWords.has(w)),
	);
}

function scoreByTags(memory: MemoryItem, keywords: Set<string>): number {
	return memory.tags.filter((tag) => keywords.has(tag.toLowerCase())).length;
}

// ─── Main retrieval ───────────────────────────────────────────────────────────

export async function findRelevantMemories(
	memories: MemoryItem[],
	recentTurns?: Turn[],
	maxResults = 5,
): Promise<RelevantMemoryResult> {
	if (memories.length === 0) {
		return { details: [], llmFallbackFired: false, memories: [], reasons: {} };
	}

	// Pass 1: always include high-importance memories
	const alwaysInclude = memories.filter((m) => m.importance >= 0.8);
	const alwaysIds = new Set(alwaysInclude.map((m) => m.id));
	const alwaysDetails: MemoryWithReason[] = alwaysInclude.map((m) => ({
		memory: m,
		reason: 'always_include' as MemoryReason,
	}));

	const remaining1 = memories.filter((m) => !alwaysIds.has(m.id));

	// Pass 2: semantic similarity using embeddings
	const semanticDetails: MemoryWithReason[] = [];
	const semanticIds = new Set<string>();

	if (recentTurns && recentTurns.length > 0) {
		const queryText = recentTurns
			.slice(-3)
			.map((t) => t.text)
			.join(' ');

		const embeddedMemories = remaining1.filter((m) => m.embedding && m.embedding.length > 0);

		if (embeddedMemories.length > 0) {
			try {
				const queryVec = await embedText(queryText);
				for (const m of embeddedMemories) {
					if (!m.embedding) continue;
					const sim = cosineSimilarity(queryVec, m.embedding);
					const score = sim * (0.5 + m.importance * 0.5);
					if (sim >= 0.65) {
						semanticDetails.push({ memory: m, reason: 'semantic', score });
						semanticIds.add(m.id);
					}
				}
				semanticDetails.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
			} catch {
				// embedding query failed — skip semantic pass
			}
		}
	}

	// Pass 3: tag matching for remaining slots
	const remaining2 = remaining1.filter((m) => !semanticIds.has(m.id));
	const keywords = recentTurns ? extractKeywords(recentTurns) : new Set<string>();
	const tagDetails: MemoryWithReason[] = remaining2
		.map((m) => ({ memory: m, reason: 'tag_match' as MemoryReason, score: scoreByTags(m, keywords) }))
		.filter((x) => x.score >= 1)
		.sort((a, b) => b.score - a.score);

	const combined = [...alwaysDetails, ...semanticDetails, ...tagDetails];

	if (combined.length >= maxResults) {
		const sliced = combined.slice(0, maxResults);
		const reasons: Record<string, MemoryReason> = {};
		for (const d of sliced) reasons[d.memory.id] = d.reason;
		return { details: sliced, llmFallbackFired: false, memories: sliced.map((d) => d.memory), reasons };
	}

	// Pass 4: LLM fallback for remaining slots
	const combinedIds = new Set(combined.map((d) => d.memory.id));
	const remaining3 = memories.filter((m) => !combinedIds.has(m.id));

	if (remaining3.length === 0) {
		const reasons: Record<string, MemoryReason> = {};
		for (const d of combined) reasons[d.memory.id] = d.reason;
		return {
			details: combined.slice(0, maxResults),
			llmFallbackFired: false,
			memories: combined.slice(0, maxResults).map((d) => d.memory),
			reasons,
		};
	}

	const needed = maxResults - combined.length;
	const contextText = recentTurns
		?.slice(-3)
		.map((t) => `${t.role}: ${t.text}`)
		.join('\n');
	const memoryList = remaining3
		.map(
			(m) =>
				`{"id":"${m.id}","summary":${JSON.stringify(m.summary)},"tags":${JSON.stringify(m.tags)}}`,
		)
		.join('\n');

	let raw = '';
	let llmFallbackFired = false;
	try {
		await streamChat({
			messages: [
				{
					content:
						'You are a memory relevance filter. Return ONLY a JSON array of memory IDs (strings) that are relevant to the current scene. Return at most ' +
						needed +
						' IDs. If none are relevant, return [].',
					role: 'system',
				},
				{
					content: `Current scene:\n${contextText}\n\nAvailable memories:\n${memoryList}`,
					role: 'user',
				},
			],
			onChunk: (chunk) => {
				raw += chunk;
			},
			temperature: 0.1,
		});

		llmFallbackFired = true;
		const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
		const ids: unknown = JSON.parse((fenced ? fenced[1] : raw).trim());
		if (Array.isArray(ids)) {
			const idSet = new Set(
				ids.filter((x): x is string => typeof x === 'string'),
			);
			const llmDetails: MemoryWithReason[] = remaining3
				.filter((m) => idSet.has(m.id))
				.slice(0, needed)
				.map((m) => ({ memory: m, reason: 'llm_picked' as MemoryReason }));

			const allDetails = [...combined, ...llmDetails].slice(0, maxResults);
			const reasons: Record<string, MemoryReason> = {};
			for (const d of allDetails) reasons[d.memory.id] = d.reason;
			return {
				details: allDetails,
				llmFallbackFired,
				memories: allDetails.map((d) => d.memory),
				reasons,
			};
		}
	} catch {
		// LLM call failed — return what earlier passes found
	}

	const fallbackDetails = combined.slice(0, maxResults);
	const reasons: Record<string, MemoryReason> = {};
	for (const d of fallbackDetails) reasons[d.memory.id] = d.reason;
	return {
		details: fallbackDetails,
		llmFallbackFired,
		memories: fallbackDetails.map((d) => d.memory),
		reasons,
	};
}
