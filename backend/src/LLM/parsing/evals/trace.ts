import type {
	ParseTraceCharacterUpdate,
	ParseTraceEmitter,
	ParseTraceEventInput,
	ParseTracePartialUpdate,
} from '../trace-types.js';
import type { ParseVerboseEvent } from '../verbose-types.js';
import type {
	PartialTraceRecord,
	TraceRecord,
	VerboseRecord,
} from './types.js';

export class BenchmarkTraceCollector implements ParseTraceEmitter {
	characterProgress: ParseTraceCharacterUpdate[] = [];
	currentStage: string | null = null;
	events: TraceRecord[] = [];
	partials: PartialTraceRecord[] = [];
	sequence = 0;

	constructor(readonly signal?: AbortSignal) {}

	async emit(event: ParseTraceEventInput): Promise<void> {
		this.events.push({
			kind: event.kind,
			payload: event.payload ?? {},
			sequence: ++this.sequence,
			stage: event.stage ?? null,
			timestamp: new Date().toISOString(),
		});
	}

	async replacePartial(update: ParseTracePartialUpdate): Promise<void> {
		this.partials.push({
			...update,
			sequence: ++this.sequence,
			timestamp: new Date().toISOString(),
		});
	}

	async setCharacterProgress(
		update: ParseTraceCharacterUpdate,
	): Promise<void> {
		this.characterProgress = [
			...this.characterProgress.filter(
				(entry) => entry.name !== update.name,
			),
			update,
		];
	}

	async setStage(stage: string | null): Promise<void> {
		this.currentStage = stage;
	}

	snapshot() {
		return {
			characterProgress: this.characterProgress,
			currentStage: this.currentStage,
			events: this.events,
			partials: this.partials,
		};
	}
}

export function createVerboseCollector(
	repeatIndex: number,
	runType: 'isolated' | 'pipeline',
	stageLabel: string,
) {
	const records: VerboseRecord[] = [];
	return {
		callback: (event: ParseVerboseEvent) => {
			records.push({
				...event,
				repeatIndex,
				runType,
				sequence: records.length + 1,
				stageLabel,
				timestamp: new Date().toISOString(),
			});
		},
		records,
	};
}
