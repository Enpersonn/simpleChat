export interface ParseVerboseEvent {
	agent: string;
	attempt?: number;
	step: 'request' | 'response';
	chunkIndex?: number;
	totalChunks?: number;
	prompt?: string;
	rawText?: string;
	durationMs?: number;
}

export type ParseVerboseCallback = (event: ParseVerboseEvent) => void;
