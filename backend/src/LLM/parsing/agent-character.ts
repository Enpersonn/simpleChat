import { characterDeepDiveAgent } from '../../features/characters/parsing-agent.js';
import { normaliseCharacter } from '../normalizers.js';
import { runChunkedPass } from './chunked-pass.js';
import type { ParseTraceEmitter } from './trace-types.js';
import type { ParseVerboseCallback } from './verbose-types.js';

type NormalisedCharacter = ReturnType<typeof normaliseCharacter>;
type CharacterParseContext = { premise?: string };
export interface CharacterExtractionInput {
	chunkIndices?: number[];
	chunks: string[];
	name: string;
}

const CHARACTER_WORKER_CONCURRENCY = 2;
const PARSE_LLM_RETRY_COUNT = 1;
const PARSE_LLM_TIMEOUT_MS = 180_000;

function isAbortError(error: unknown): boolean {
	return error instanceof DOMException
		? error.name === 'AbortError'
		: error instanceof Error
			? error.name === 'AbortError'
			: false;
}

async function emitCharacterEvent(
	trace: ParseTraceEmitter | undefined,
	kind: 'character_start' | 'character_complete' | 'character_error',
	name: string,
	payload: Record<string, unknown> = {},
) {
	await trace?.emit({
		kind,
		payload: { name, ...payload },
		stage: 'story.characters',
	});
}

export async function runCharacterDeepDiveAgent(
	characterInputs: CharacterExtractionInput[],
	ctx?: CharacterParseContext,
	onCharacterProgress?: (name: string, status: 'start' | 'complete') => void,
	onVerbose?: ParseVerboseCallback,
	signal?: AbortSignal,
	trace?: ParseTraceEmitter,
): Promise<NormalisedCharacter[]> {
	if (characterInputs.length === 0) return [];

	const results: NormalisedCharacter[] = [];
	let nextIndex = 0;

	const extractCharacter = async (
		characterInput: CharacterExtractionInput,
	): Promise<NormalisedCharacter | null> => {
		const characterName = characterInput.name;
		await emitCharacterEvent(trace, 'character_start', characterName);
		await trace?.setCharacterProgress({
			name: characterName,
			status: 'running',
		});
		onCharacterProgress?.(characterName, 'start');

		const prefixParts = [
			...(ctx?.premise ? [`Story premise: ${ctx.premise}`] : []),
			`Extract EVERYTHING about: ${characterName}`,
		];
		const agentLabel = `character:${characterName}`;

		try {
			const arr = await runChunkedPass<NormalisedCharacter>(
				{
					buildPrompt: (chunk, index, total) =>
						[
							prefixParts.join('\n\n'),
							`Story text (routed section ${index + 1} of ${total}, original chunk ${
								(characterInput.chunkIndices?.[index] ??
									index) + 1
							}):\n${chunk}`,
							'Respond with ONLY the JSON object. No other text.',
						]
							.filter(Boolean)
							.join('\n\n'),
					chunkInput: {
						chunks: characterInput.chunks,
						maxChars: 3000,
						overlapChars: 300,
					},
					extractor: characterDeepDiveAgent,
					maxConcurrency: 1,
					parseChunk: (result) => {
						if (typeof result !== 'object' || result === null) {
							return [];
						}
						const parsed = normaliseCharacter(
							result as Record<string, unknown>,
						);
						return parsed.name ? [parsed] : [];
					},
					promptScope: 'story.characters.deep_dive',
					retryCount: PARSE_LLM_RETRY_COUNT,
					stage: 'story.characters',
					traceAgent: agentLabel,
				},
				{
					onVerbose,
					signal,
					timeoutMs: PARSE_LLM_TIMEOUT_MS,
					trace,
				},
			);
			const found =
				arr.find(
					(c) => c.name.toLowerCase() === characterName.toLowerCase(),
				) ?? arr[0];

			if (!found) {
				await trace?.emit({
					kind: 'warning',
					payload: {
						message: `No character result returned for ${characterName}`,
						name: characterName,
					},
					stage: 'story.characters',
				});
				await trace?.setCharacterProgress({
					detail: 'No result returned',
					name: characterName,
					status: 'error',
				});
				await emitCharacterEvent(
					trace,
					'character_error',
					characterName,
					{
						message: 'No result returned',
					},
				);
				return null;
			}

			onCharacterProgress?.(found.name, 'complete');
			await trace?.setCharacterProgress({
				name: found.name,
				status: 'complete',
			});
			await emitCharacterEvent(trace, 'character_complete', found.name, {
				identityCount: found.identities.length,
				relationshipCount: found.relationships.length,
			});
			return found;
		} catch (error) {
			if (isAbortError(error)) throw error;
			const message =
				error instanceof Error ? error.message : String(error);
			await trace?.setCharacterProgress({
				detail: message,
				name: characterName,
				status: 'error',
			});
			await emitCharacterEvent(trace, 'character_error', characterName, {
				message,
			});
			await trace?.emit({
				kind: 'warning',
				payload: {
					message,
					name: characterName,
				},
				stage: 'story.characters',
			});
			console.warn(
				`[characterAgent] deep dive failed for "${characterName}":`,
				message,
			);
			return null;
		}
	};

	const workerCount = Math.min(
		CHARACTER_WORKER_CONCURRENCY,
		characterInputs.length,
	);
	const workers = Array.from({ length: workerCount }, async () => {
		while (nextIndex < characterInputs.length) {
			if (signal?.aborted) {
				throw signal.reason instanceof Error
					? signal.reason
					: new DOMException('Aborted', 'AbortError');
			}
			const currentIndex = nextIndex++;
			const characterInput = characterInputs[currentIndex];
			const result = await extractCharacter(characterInput);
			if (result) results.push(result);
		}
	});

	await Promise.all(workers);

	return results.filter((character) => !!character.name);
}
