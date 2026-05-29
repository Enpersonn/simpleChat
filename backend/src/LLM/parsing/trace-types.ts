export interface ParseTraceEventInput {
	kind: string;
	payload?: Record<string, unknown>;
	stage?: string | null;
}

export interface ParseTracePartialUpdate {
	slice: 'storyCore' | 'characters' | 'locations' | 'memories';
	stage?: string | null;
	value: unknown;
}

export interface ParseTraceCharacterUpdate {
	detail?: string;
	name: string;
	status: 'pending' | 'running' | 'complete' | 'error';
}

export interface ParseTraceEmitter {
	signal?: AbortSignal;
	emit(event: ParseTraceEventInput): Promise<void>;
	replacePartial(update: ParseTracePartialUpdate): Promise<void>;
	setCharacterProgress(update: ParseTraceCharacterUpdate): Promise<void>;
	setStage(stage: string | null): Promise<void>;
}
