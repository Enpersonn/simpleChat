export type PipelineStep =
	| 'prepare_turns'
	| 'data_load'
	| 'memory_chain'
	| 'memory_retrieval'
	| 'context_assembly'
	| 'llm_call'
	| 'persist_result'
	| 'extraction'
	| 'planning_reply'
	| 'proposal_author';

export type PipelineStatus = 'start' | 'complete' | 'error';

export type MemoryReason =
	| 'always_include'
	| 'semantic'
	| 'tag_match'
	| 'llm_picked';

// ── Step-specific data payloads ───────────────────────────────────────────────

export interface DataLoadData {
	characterCount: number;
	locationCount: number;
	turnCount: number;
}

export interface MemoryChainCharDiff {
	characterId: string;
	characterName: string;
	chainLength: number;
	hasGenesisMemory: boolean;
	effectiveDiff: {
		personalityAdded: string[];
		personalityRemoved: string[];
		fearsAdded: string[];
		speechStyleChanged: boolean;
		trueMotivestChanged: boolean;
		hiddenEmotionalStateChanged: boolean;
	};
}

export interface MemoryChainData {
	chains: MemoryChainCharDiff[];
}

export interface MemoryRetrievalEntry {
	memoryId: string;
	summary: string;
	reason: MemoryReason;
	score?: number;
	tags: string[];
}

export interface MemoryRetrievalData {
	accessibleCount: number;
	results: MemoryRetrievalEntry[];
	llmFallbackFired: boolean;
}

export interface ContextAssemblyData {
	systemPromptLength: number;
	injectedMemoryIds: string[];
	activeSpeakerId: string;
	currentLocationId: string | null;
	moodTagCount: number;
}

export interface LlmCallData {
	model: string;
	tokenCount: number;
	durationMs: number;
	agentSteps?: number;
}

export interface PersistResultData {
	turnId?: string;
}

export interface ExtractionData {
	locationChanged: boolean;
	newLocationCreated: boolean;
	newLocationId: string | null;
	newLocationName: string | null;
	overridesChanged: boolean;
	canonFactsCreated?: number;
	narrativePressure?: number;
	relationshipUpdates?: number;
	volatileUpdates?: number;
}

export type PipelineStepData =
	| DataLoadData
	| MemoryChainData
	| MemoryRetrievalData
	| ContextAssemblyData
	| LlmCallData
	| PersistResultData
	| ExtractionData;

// ── Top-level pipeline event ──────────────────────────────────────────────────

export interface PipelineEvent {
	step: PipelineStep;
	status: PipelineStatus;
	durationMs?: number;
	data?: PipelineStepData;
}

// ── Context snapshot ──────────────────────────────────────────────────────────

export interface SnapshotCharacter {
	id: string;
	name: string;
	role: string;
	isUserPersona: boolean;
	isNarrator: boolean;
	basePersonality: string[];
	effectivePersonality: string[];
	baseSpeechStyle: string;
	effectiveSpeechStyle: string;
	baseTrueMotives: string;
	effectiveTrueMotives: string;
	baseFears: string[];
	effectiveFears: string[];
}

export interface SnapshotMemory {
	id: string;
	summary: string;
	tags: string[];
	importance: number;
}

export interface SnapshotLocation {
	id: string;
	name: string;
	isCurrent: boolean;
}

export interface ContextSnapshot {
	story: { id: string; title: string };
	activeSpeakerId: string;
	characters: SnapshotCharacter[];
	accessibleMemories: SnapshotMemory[];
	injectedMemoryIds: string[];
	memoryReasons: Record<string, MemoryReason>;
	locations: SnapshotLocation[];
	currentLocationId: string | null;
	moodTags: string[];
	responseLength: string;
	feelText: string;
	model: string;
}
