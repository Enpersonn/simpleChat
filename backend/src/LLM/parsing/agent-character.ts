import { createOrchestrator } from '@llm-helpers/agents';
import { createAgent } from '@llm-helpers/an-agent-runtime-handler';
import {
	createFunctionProvider,
	createToolSystem,
	defineTool,
} from '@llm-helpers/tools';
import { z } from 'zod';
import { characterDeepDiveAgent } from '../../features/characters/parsing-agent.js';
import { normaliseCharacter } from '../normalizers.js';
import { createOllamaRuntime } from '../runtime.js';
import type { ParseContext } from './service.js';
import { runChunked } from './service.js';
import type { ParseVerboseCallback } from './verbose-types.js';

type NormalisedCharacter = ReturnType<typeof normaliseCharacter>;

export async function runCharacterDeepDiveAgent(
	characterNames: string[],
	chunks: string[],
	ctx?: ParseContext,
	onCharacterProgress?: (name: string, status: 'start' | 'complete') => void,
	onVerbose?: ParseVerboseCallback,
): Promise<NormalisedCharacter[]> {
	if (characterNames.length === 0) return [];

	// Closure-based accumulator — the tool's execute pushes here as the agent calls it
	const results: NormalisedCharacter[] = [];

	const deepDiveTool = defineTool({
		description:
			'Extract all story information about a single named character. Call once per character.',
		execute: async ({ characterName }) => {
			onCharacterProgress?.(characterName, 'start');
			const prefixParts = [
				...(ctx?.premise ? [`Story premise: ${ctx.premise}`] : []),
				`Extract EVERYTHING about: ${characterName}`,
			];
			const agentLabel = `character:${characterName}`;
			try {
				const arr = await runChunked(
					characterDeepDiveAgent,
					chunks,
					prefixParts.join('\n\n'),
					'characters',
					normaliseCharacter,
					(c) => !!c.name,
					undefined,
					onVerbose ? { agentLabel, onVerbose } : undefined,
				);
				const found = arr.find(
					(c) => c.name.toLowerCase() === characterName.toLowerCase(),
				);
				if (found) {
					results.push(found);
					onCharacterProgress?.(found.name, 'complete');
					return { name: found.name, ok: true };
				}
				// fallback: single-chunk direct call
				const raw = await characterDeepDiveAgent.run(
					[
						...prefixParts,
						`Story text (section 1 of ${chunks.length}):\n${chunks[0]}`,
						'Respond with ONLY the JSON object. No other text.',
					].join('\n\n'),
					{
						onVerbose: onVerbose
							? (ev) =>
									onVerbose({
										agent: `${agentLabel}:fallback`,
										...ev,
									})
							: undefined,
					},
				);
				const c = normaliseCharacter(raw);
				results.push(c);
				onCharacterProgress?.(c.name, 'complete');
				return { name: c.name, ok: true };
			} catch (err) {
				console.warn(
					`[characterAgent] deep_dive_character failed for "${characterName}":`,
					err,
				);
				return { name: characterName, ok: false };
			}
		},
		input: z.object({ characterName: z.string() }),
		name: 'deep_dive_character',
	});

	const toolSystem = createToolSystem({
		providers: [createFunctionProvider('character-agent', [deepDiveTool])],
	});

	const runtime = await createOllamaRuntime({ numCtx: 8192 });
	const emptyToolSystem = createToolSystem({
		providers: [createFunctionProvider('parse-coordinator', [])],
	});

	const nameList = characterNames.map((n, i) => `${i + 1}. ${n}`).join('\n');

	try {
		const orchestrator = createOrchestrator({
			agents: {
				'character-analyst': {
					options: {
						hooks: {
							onContextOverflow: (messages) => messages.slice(-6),
						},
						maxSteps: characterNames.length + 4,
						onToolError: 'continue',
					},
					provider: runtime.provider,
					systemPrompt:
						'You are a story analyst. For each character name listed, call deep_dive_character exactly once. Do not skip any character.',
					tools: toolSystem,
				},
				'parse-coordinator': {
					options: {
						maxSteps: 3,
					},
					provider: runtime.provider,
					systemPrompt:
						'Delegate the character extraction task to the character-analyst agent using the ask skill exactly once. After the worker replies, confirm completion in one short sentence.',
					tools: emptyToolSystem,
				},
			},
			router: () => 'parse-coordinator',
		});
		await orchestrator.run(
			`Process these ${characterNames.length} characters:\n${nameList}\n\nCall deep_dive_character for each one.`,
		);
	} catch (err) {
		console.warn(
			'[characterAgent] agent loop error (using partial results):',
			err,
		);
	}

	// Fallback: if agent produced nothing (model doesn't support tool calling), run sequential
	if (results.length === 0) {
		console.warn(
			'[characterAgent] no results from agent, falling back to sequential extraction',
		);
		for (const name of characterNames) {
			onCharacterProgress?.(name, 'start');
			try {
				const prefixParts = [
					...(ctx?.premise ? [`Story premise: ${ctx.premise}`] : []),
					`Extract EVERYTHING about: ${name}`,
				];
				const arr = await runChunked(
					characterDeepDiveAgent,
					chunks,
					prefixParts.join('\n\n'),
					'characters',
					normaliseCharacter,
					(c) => !!c.name,
					undefined,
					onVerbose
						? { agentLabel: `character:${name}`, onVerbose }
						: undefined,
				);
				const found =
					arr.find(
						(c) => c.name.toLowerCase() === name.toLowerCase(),
					) ?? arr[0];
				if (found) {
					results.push(found);
					onCharacterProgress?.(found.name, 'complete');
				}
			} catch {
				// skip
			}
		}
	}

	return results.filter((c) => !!c.name);
}
