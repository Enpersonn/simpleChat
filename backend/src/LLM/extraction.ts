import type {
	Character,
	ChatEntityState,
	LocationOverride,
	Story,
	StoryLocation,
	Turn,
	VolatileCharacterState,
} from '@simplechat/types';
import { z } from 'zod';
import { createPromptRunner } from '../LLM/prompt-runners/create-prompt-runner.js';
import { createOllamaRuntime } from './runtime.js';

export interface ExtractionContext {
	activeSpeakers: string[];
	characters: Character[];
	chatId: string;
	currentState: ChatEntityState;
	locations: StoryLocation[];
	recentTurns: Turn[];
	story: Story;
	storyId: string;
}

export interface RelationshipUpdate {
	fromCharId: string;
	newEmotion?: string;
	toCharId: string;
	trustDelta: number;
}

export interface CanonFact {
	characterIds: string[];
	importance: number;
	summary: string;
	tags: string[];
}

export interface ExtractionOutput extends ChatEntityState {
	canonFacts: CanonFact[];
	newHooks: string[];
	newLocationName?: string;
	pressureDelta: number;
	relationshipUpdates: RelationshipUpdate[];
	resolvedHooks: string[];
	volatileStateUpdates: Record<string, VolatileCharacterState>;
}

// ─── Location extractor ───────────────────────────────────────────────────────

const LocationExtractionSchema = z.object({
	currentLocationId: z.union([z.string(), z.null()]).optional(),
	newLocationName: z.string().optional(),
	stateChanges: z.record(z.string(), z.string()).optional(),
});

const locationExtractor = {
	type: 'location',
	async extract(ctx: ExtractionContext) {
		if (ctx.locations.length === 0) return {};

		const recentText = ctx.recentTurns
			.slice(-4)
			.map((t) => `${t.role}: ${t.text}`)
			.join('\n');

		const locationList = ctx.locations
			.map((l) => `{"id":"${l.id}","name":${JSON.stringify(l.name)}}`)
			.join(', ');

		const currentId = ctx.currentState.currentLocationId;

		try {
			const runtime = await createOllamaRuntime();
			const response = await runtime.json({
				messages: [
					{
						content: [
							'You are a scene-state tracker. Return ONLY valid JSON.',
							'Analyze the messages and detect scene changes.',
							'Return this shape:',
							'{',
							'  "currentLocationId": "<id from list, \\"unchanged\\" if same as before, or null if no location>",',
							'  "newLocationName": "<name of the new place if characters explicitly moved somewhere NOT in the location list, otherwise omit>",',
							'  "stateChanges": { "<field>": "<new value>" }',
							'  // stateChanges applies to the current location. Fields: lighting, atmosphere, soundscape, smells, description',
							'  // Only include fields that explicitly changed in the messages.',
							'  // If newLocationName is set, set currentLocationId to null.',
							'}',
						].join('\n'),
						role: 'system',
					},
					{
						content: [
							`Available locations: [${locationList}]`,
							`Current location id: ${currentId ?? 'none'}`,
							`\nRecent messages:\n${recentText}`,
						].join('\n'),
						role: 'user',
					},
				],
				schema: LocationExtractionSchema,
				temperature: 0.1,
			});
			const data = response.json;

			const result: {
				currentLocationId?: string | null;
				locationOverrides?: Record<string, LocationOverride>;
				newLocationName?: string;
			} = {};

			if (data.newLocationName?.trim()) {
				result.currentLocationId = null;
				result.newLocationName = data.newLocationName.trim();
			} else if (
				data.currentLocationId !== undefined &&
				data.currentLocationId !== 'unchanged'
			) {
				result.currentLocationId =
					data.currentLocationId === null ||
					data.currentLocationId === 'null' ||
					data.currentLocationId === ''
						? null
						: data.currentLocationId;
			}

			const targetId =
				result.currentLocationId !== undefined
					? result.currentLocationId
					: currentId;

			if (targetId && data.stateChanges) {
				const changes = data.stateChanges;
				const override: LocationOverride = {};
				if (changes.atmosphere) override.atmosphere = changes.atmosphere;
				if (changes.description) override.description = changes.description;
				if (changes.lighting) override.lighting = changes.lighting;
				if (changes.smells) override.smells = changes.smells;
				if (changes.soundscape) override.soundscape = changes.soundscape;
				if (Object.keys(override).length > 0) {
					result.locationOverrides = {
						...ctx.currentState.locationOverrides,
						[targetId]: {
							...(ctx.currentState.locationOverrides[targetId] ?? {}),
							...override,
						},
					};
				}
			}

			return result;
		} catch {
			return {};
		}
	},
};

// ─── Character state extractor ────────────────────────────────────────────────

const characterStateRunner = createPromptRunner({
	instructions: [
		'Analyze the recent story exchange and detect emotional state changes for each character.',
		'Return a JSON object with a "states" key mapping character IDs to their NEW state.',
		'Only include characters whose state actually changed in this exchange.',
		'emotionalColor: 2-5 word phrase capturing their dominant feeling right now (e.g. "quietly devastated", "cautiously hopeful", "barely contained fury").',
		'stress: 0-10 integer. 5 is baseline. Acute pressure raises it; comfort lowers it.',
		'focus: the specific thing occupying their mind right now (e.g. "the lie he just told", "whether she noticed", "escaping this conversation").',
		'If nothing changed for a character, omit them. If you are uncertain, omit them.',
		'Return ONLY valid JSON.',
	].join('\n'),
	outputSchema: z.object({
		states: z
			.record(
				z.string(),
				z.object({
					emotionalColor: z.string().default(''),
					focus: z.string().default(''),
					stress: z.number().min(0).max(10).default(5),
				}),
			)
			.default({}),
	}),
	role: 'character emotional state analyst',
	temperature: 0.1,
});

const characterStateExtractor = {
	type: 'character_state',
	async extract(ctx: ExtractionContext): Promise<Record<string, VolatileCharacterState>> {
		const activeChars = ctx.characters.filter((c) =>
			ctx.activeSpeakers.includes(c.id),
		);
		if (activeChars.length === 0) return {};

		const charList = activeChars.map((c) => `${c.id}: ${c.name}`).join('\n');
		const recentText = ctx.recentTurns
			.slice(-4)
			.map((t) => `${t.role}: ${t.text}`)
			.join('\n');

		try {
			const result = await characterStateRunner.run(
				`Characters present (id: name):\n${charList}\n\nRecent exchange:\n${recentText}`,
			);
			return (result.states as Record<string, VolatileCharacterState>) ?? {};
		} catch {
			return {};
		}
	},
};

// ─── Relationship extractor ───────────────────────────────────────────────────

const relationshipRunner = createPromptRunner({
	instructions: [
		'Analyze the recent story exchange and detect relationship changes between characters.',
		'Return a JSON object with an "updates" array.',
		'Each entry: fromCharId (who feels this), toCharId (about whom), trustDelta (-3 to +3 integer), newEmotion (optional, replaces current emotion).',
		'trustDelta: positive = trust increased, negative = trust decreased. Only include if meaningfully changed (≥ 1 point).',
		'newEmotion: only include if the emotional character of the relationship shifted (e.g. from "neutral" to "suspicious", "fond" to "betrayed").',
		'Only include updates for relationships that genuinely changed. If nothing changed, return empty array.',
		'Return ONLY valid JSON.',
	].join('\n'),
	outputSchema: z.object({
		updates: z
			.array(
				z.object({
					fromCharId: z.string(),
					newEmotion: z.string().optional(),
					toCharId: z.string(),
					trustDelta: z.number().int().min(-3).max(3),
				}),
			)
			.default([]),
	}),
	role: 'relationship dynamics analyst',
	temperature: 0.1,
});

const relationshipExtractor = {
	type: 'relationship',
	async extract(ctx: ExtractionContext): Promise<RelationshipUpdate[]> {
		const namedChars = ctx.characters.filter(
			(c) => !c.isUserPersona && !c.isNarrator,
		);
		if (namedChars.length < 2) return [];

		const charList = namedChars.map((c) => `${c.id}: ${c.name}`).join('\n');
		const recentText = ctx.recentTurns
			.slice(-4)
			.map((t) => `${t.role}: ${t.text}`)
			.join('\n');

		try {
			const result = await relationshipRunner.run(
				`Characters (id: name):\n${charList}\n\nRecent exchange:\n${recentText}`,
			);
			return (result.updates as RelationshipUpdate[]) ?? [];
		} catch {
			return [];
		}
	},
};

// ─── Canon fact extractor ─────────────────────────────────────────────────────

const canonFactRunner = createPromptRunner({
	instructions: [
		'Analyze the recent story exchange and extract NEW facts established as canon.',
		'A canon fact is something explicitly stated, revealed, admitted, or confirmed — not implied or suggested.',
		'Examples: a character admitting a lie, revealing a secret, making a promise, disclosing their past.',
		'Return a JSON object with a "facts" array. Each entry:',
		'  summary: concise factual statement of what was established (1-2 sentences, past tense).',
		'  tags: 2-5 keywords for retrieval (character names, themes, objects, places).',
		'  importance: 0.0-1.0. Major revelations = 0.8+. Minor details = 0.3-0.5.',
		'  characterIds: array of character IDs directly involved.',
		'Only include genuinely new information. If nothing new was established, return an empty array.',
		'Return ONLY valid JSON.',
	].join('\n'),
	outputSchema: z.object({
		facts: z
			.array(
				z.object({
					characterIds: z.array(z.string()).default([]),
					importance: z.number().min(0).max(1).default(0.4),
					summary: z.string(),
					tags: z.array(z.string()).default([]),
				}),
			)
			.default([]),
	}),
	role: 'story canon archivist',
	temperature: 0.1,
});

const canonFactExtractor = {
	type: 'canon_facts',
	async extract(ctx: ExtractionContext): Promise<CanonFact[]> {
		if (ctx.recentTurns.length === 0) return [];

		const charList = ctx.characters.map((c) => `${c.id}: ${c.name}`).join('\n');
		const recentText = ctx.recentTurns
			.slice(-4)
			.map((t) => `${t.role}: ${t.text}`)
			.join('\n');

		try {
			const result = await canonFactRunner.run(
				`Characters (id: name):\n${charList}\n\nRecent exchange:\n${recentText}`,
			);
			return (result.facts as CanonFact[]) ?? [];
		} catch {
			return [];
		}
	},
};

// ─── Narrative pressure extractor ────────────────────────────────────────────

const narrativePressureRunner = createPromptRunner({
	instructions: [
		'Analyze the recent story exchange for narrative tension and unresolved dramatic threads.',
		'Return a JSON object with:',
		'  pressureDelta: integer -10 to +15.',
		'    +10 to +15: major confrontation, revelation, or crisis introduced.',
		'    +5 to +9: significant conflict, suppressed emotion surfacing, high-stakes moment.',
		'    +1 to +4: mild tension, unresolved question, subtle discomfort.',
		'    0: neutral scene, comfortable exchange.',
		'    -5 to -1: tension released, conflict resolved, emotional comfort achieved.',
		'  newHooks: array of brief strings (max 10 words each) capturing NEW unresolved tensions in this exchange.',
		'    Examples: "She lied about knowing him", "The promise he made hangs unspoken".',
		'  resolvedHooks: copy the exact text of any existing hook that was explicitly resolved. If none, return [].',
		'Return ONLY valid JSON.',
	].join('\n'),
	outputSchema: z.object({
		newHooks: z.array(z.string()).default([]),
		pressureDelta: z.number().int().min(-10).max(15).default(0),
		resolvedHooks: z.array(z.string()).default([]),
	}),
	role: 'narrative tension analyst',
	temperature: 0.1,
});

const narrativePressureExtractor = {
	type: 'narrative_pressure',
	async extract(ctx: ExtractionContext): Promise<{ newHooks: string[]; pressureDelta: number; resolvedHooks: string[] }> {
		if (ctx.recentTurns.length === 0) {
			return { newHooks: [], pressureDelta: 0, resolvedHooks: [] };
		}

		const recentText = ctx.recentTurns
			.slice(-4)
			.map((t) => `${t.role}: ${t.text}`)
			.join('\n');

		const currentHooks = ctx.currentState.activeHooks;

		try {
			const result = await narrativePressureRunner.run(
				[
					`Current narrative pressure: ${ctx.currentState.narrativePressure}/100`,
					currentHooks.length > 0
						? `Existing unresolved tensions:\n${currentHooks.map((h) => `• ${h}`).join('\n')}`
						: 'No existing tensions tracked.',
					`\nRecent exchange:\n${recentText}`,
				].join('\n'),
			);
			return {
				newHooks: (result.newHooks as string[]) ?? [],
				pressureDelta: (result.pressureDelta as number) ?? 0,
				resolvedHooks: (result.resolvedHooks as string[]) ?? [],
			};
		} catch {
			return { newHooks: [], pressureDelta: 0, resolvedHooks: [] };
		}
	},
};

// ─── Runner ───────────────────────────────────────────────────────────────────

export async function runExtraction(
	ctx: ExtractionContext,
): Promise<ExtractionOutput> {
	const [locationResult, charStateResult, relResult, factResult, pressureResult] =
		await Promise.allSettled([
			locationExtractor.extract(ctx),
			characterStateExtractor.extract(ctx),
			relationshipExtractor.extract(ctx),
			canonFactExtractor.extract(ctx),
			narrativePressureExtractor.extract(ctx),
		]);

	const output: ExtractionOutput = {
		...ctx.currentState,
		canonFacts: [],
		newHooks: [],
		pressureDelta: 0,
		relationshipUpdates: [],
		resolvedHooks: [],
		volatileStateUpdates: {},
	};

	if (locationResult.status === 'fulfilled') {
		const loc = locationResult.value;
		if (loc.currentLocationId !== undefined) output.currentLocationId = loc.currentLocationId;
		if (loc.locationOverrides) output.locationOverrides = loc.locationOverrides;
		if (loc.newLocationName) output.newLocationName = loc.newLocationName;
	}

	if (charStateResult.status === 'fulfilled') {
		output.volatileStateUpdates = charStateResult.value;
	}

	if (relResult.status === 'fulfilled') {
		output.relationshipUpdates = relResult.value;
	}

	if (factResult.status === 'fulfilled') {
		output.canonFacts = factResult.value;
	}

	if (pressureResult.status === 'fulfilled') {
		const p = pressureResult.value;
		output.newHooks = p.newHooks;
		output.pressureDelta = p.pressureDelta;
		output.resolvedHooks = p.resolvedHooks;
	}

	return output;
}
