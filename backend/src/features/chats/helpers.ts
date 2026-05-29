import type { ServerResponse } from 'node:http';
import {
	type Character,
	ChatEntityStateSchema,
	type LocationCreate,
	type MemoryItem,
	type Story,
	type Turn,
} from '@simplechat/types';
import { z } from 'zod';
import { createOllamaRuntime } from '../../LLM/runtime.js';
import { writeStreamEvent } from '../../stream-events.js';
import { getMemoryChainForCharacter } from '../memories/store/index.js';

export type PipelineStep =
	| 'data_load'
	| 'memory_chain'
	| 'memory_retrieval'
	| 'context_assembly'
	| 'llm_call'
	| 'extraction';

export function emitFrame(raw: ServerResponse, frame: object): void {
	const event = 'event' in frame ? frame : { event: frame };
	raw.write(`${JSON.stringify(event)}\n`);
}

export function emitPipeline(
	raw: ServerResponse,
	step: string,
	status: 'start' | 'complete' | 'error',
	startedAt?: number,
	data?: object,
): void {
	const event: Record<string, unknown> = { status, step };
	if (startedAt !== undefined && status !== 'start') {
		event.durationMs = Date.now() - startedAt;
	}
	if (data !== undefined && status === 'complete') {
		event.data = data;
	}
	writeStreamEvent(raw, {
		channel: 'pipeline',
		data: event,
		name: event.step as string,
		status: event.status as 'start' | 'complete' | 'error',
		type: 'progress',
	});
}

export function buildChainDiffs(
	characters: Character[],
	effectiveCharacters: Character[],
	chains: MemoryItem[][],
) {
	return characters.map((base, i) => {
		const eff = effectiveCharacters[i];
		return {
			chainLength: chains[i].length,
			characterId: base.id,
			characterName: base.name,
			effectiveDiff: {
				fearsAdded: eff.private.fears.filter(
					(f) => !base.private.fears.includes(f),
				),
				hiddenEmotionalStateChanged:
					eff.private.hiddenEmotionalState !==
					base.private.hiddenEmotionalState,
				personalityAdded: eff.public.personality.filter(
					(t) => !base.public.personality.includes(t),
				),
				personalityRemoved: base.public.personality.filter(
					(t) => !eff.public.personality.includes(t),
				),
				speechStyleChanged:
					eff.public.speechStyle !== base.public.speechStyle,
				trueMotivestChanged:
					eff.private.trueMotives !== base.private.trueMotives,
			},
			hasGenesisMemory: !!base.genesisMemoryId,
		};
	});
}

export function defaultChatState(chatId: string, storyId: string) {
	return ChatEntityStateSchema.parse({
		chatId,
		currentLocationId: null,
		locationOverrides: {},
		storyId,
		updatedAt: new Date().toISOString(),
	});
}

export async function resolveCharacterChains(
	characters: import('@simplechat/types').Character[],
	memoryTimelineCutoff: string | undefined,
): Promise<import('@simplechat/types').MemoryItem[][]> {
	return Promise.all(
		characters.map((c) =>
			getMemoryChainForCharacter(c.id, memoryTimelineCutoff),
		),
	);
}

export function buildDmSystemPrompt(
	story: Story,
	characters: import('@simplechat/types').Character[],
	locations: import('@simplechat/types').StoryLocation[],
): string {
	const parts: string[] = [
		"You are a creative collaborator helping plan and develop a story. You are the author's thoughtful story architect and Dungeon Master.",
		'',
		`STORY: ${story.title}`,
	];
	if (story.premise) parts.push(`PREMISE: ${story.premise}`);
	if (story.genres?.length) parts.push(`GENRE: ${story.genres.join(', ')}`);
	if (story.tone?.length) parts.push(`TONE: ${story.tone.join(', ')}`);
	const allRules = [
		...(story.rules?.worldRules ?? []),
		...(story.rules?.storyRules ?? []),
		...(story.rules?.characterRules ?? []),
	];
	if (allRules.length) {
		parts.push('WORLD RULES:');
		for (const rule of allRules) parts.push(`- ${rule}`);
	}

	if (characters.length > 0) {
		parts.push('', 'EXISTING CHARACTERS:');
		for (const c of characters) {
			const traits = c.public?.personality?.join(', ') ?? '';
			const appearance = c.public?.appearance ?? '';
			let line = `- ${c.name}`;
			if (c.role) line += ` (${c.role})`;
			if (appearance) line += `: ${appearance}`;
			if (traits) line += `. Traits: ${traits}`;
			parts.push(line);
		}
	}

	if (locations.length > 0) {
		parts.push('', 'EXISTING LOCATIONS:');
		for (const l of locations) {
			let line = `- ${l.name}`;
			if (l.description) line += `: ${l.description}`;
			parts.push(line);
		}
	}

	parts.push(
		'',
		'YOUR ROLE:',
		"- Be a proactive creative partner — suggest what the story needs, don't just respond passively",
		'- When you propose a specific character, location, or backstory event, describe it with concrete details',
		'- Stay true to the established tone and world rules',
		'- Be concise but substantive; you are building this story together with the author',
		'- If the author agrees to add something, confirm and describe it fully so it can be saved',
	);

	return parts.join('\n');
}

export async function generateLocationFromContext(
	name: string,
	story: Story,
	recentTurns: Turn[],
): Promise<LocationCreate> {
	const sceneText = recentTurns.map((t) => `${t.role}: ${t.text}`).join('\n');
	const schema = z.object({
		atmosphere: z.string().default(''),
		description: z.string().default(''),
		layout: z.string().default(''),
		lighting: z.string().default(''),
		notes: z.string().default(''),
		smells: z.string().default(''),
		soundscape: z.string().default(''),
		tags: z.array(z.string()).default([]),
	});
	try {
		const runtime = await createOllamaRuntime();
		const response = await runtime.json({
			messages: [
				{
					content: [
						'You are a setting designer. Return ONLY valid JSON describing a location.',
						'Return this shape: { "description": "", "atmosphere": "", "lighting": "", "soundscape": "", "smells": "", "layout": "", "notes": "", "tags": [] }',
						'Infer sensory details from the scene context. Be evocative but concise (1-2 sentences per field).',
					].join('\n'),
					role: 'system',
				},
				{
					content: `Story: ${story.premise ?? story.title}\nNew location name: ${name}\nRecent scene:\n${sceneText}`,
					role: 'user',
				},
			],
			schema,
			temperature: 0.3,
		});
		const data = response.json;
		return {
			atmosphere: data.atmosphere,
			description: data.description,
			layout: data.layout,
			lighting: data.lighting,
			name,
			notes: data.notes,
			smells: data.smells,
			soundscape: data.soundscape,
			tags: data.tags,
		};
	} catch {
		return { name };
	}
}
