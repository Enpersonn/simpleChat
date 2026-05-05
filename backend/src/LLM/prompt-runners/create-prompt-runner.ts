import { z } from 'zod';
import { extractJson } from '../../utils.js';
import { LLMParseError } from '../generate.js';
import { streamChat } from '../ollama.js';

function schemaToExample(schema: z.ZodTypeAny): unknown {
	if (schema instanceof z.ZodString) return 'example value';
	if (schema instanceof z.ZodNumber) return 0;
	if (schema instanceof z.ZodBoolean) return true;
	if (schema instanceof z.ZodNull) return null;
	if (schema instanceof z.ZodUnknown) return null;
	if (schema instanceof z.ZodEnum)
		return (schema.options as unknown[])[0] ?? 'example value';
	if (schema instanceof z.ZodArray)
		return [
			schemaToExample(schema.element),
			schemaToExample(schema.element),
		];
	if (schema instanceof z.ZodRecord) return {};
	if (schema instanceof z.ZodOptional)
		return schemaToExample(schema.unwrap());
	if (schema instanceof z.ZodNullable)
		return schemaToExample(schema.unwrap());
	if (schema instanceof z.ZodDefault)
		return schemaToExample(schema._def.innerType as z.ZodTypeAny);
	if (schema instanceof z.ZodObject) {
		const result: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(
			schema.shape as Record<string, z.ZodTypeAny>,
		)) {
			result[key] = schemaToExample(value);
		}
		return result;
	}
	return null;
}

function rootSchemaKind(schema: z.ZodTypeAny): 'object' | 'array' | 'value' {
	if (schema instanceof z.ZodObject) return 'object';
	if (schema instanceof z.ZodArray) return 'array';
	if (
		schema instanceof z.ZodOptional ||
		schema instanceof z.ZodNullable ||
		schema instanceof z.ZodDefault
	)
		return rootSchemaKind(schema._def.innerType as z.ZodTypeAny);
	return 'value';
}

export const createPromptRunner = <T extends z.ZodTypeAny>(config: {
	role: string;
	instructions: string;
	outputSchema: T;
	temperature: number;
	num_ctx?: number;
}) => {
	const exampleJson = JSON.stringify(
		schemaToExample(config.outputSchema),
		null,
		2,
	);
	const kind = rootSchemaKind(config.outputSchema);
	const outputNoun = kind === 'array' ? 'JSON array' : 'JSON object';

	const buildSystemPrompt = (): string => {
		return [
			`You are a ${config.role}. Your ONLY job is to output a single ${outputNoun} — nothing else.`,
			'Do NOT write any analysis, explanation, commentary, or prose.',
			'Do NOT use markdown or code fences.',
			config.instructions,
			`Output ONLY the raw ${outputNoun} below, with no text before or after it:`,
			exampleJson,
		].join('\n');
	};

	const run = async (
		userContent: string,
		overrides?: { temperature?: number; num_ctx?: number },
	): Promise<z.infer<T>> => {
		let raw = '';
		await streamChat({
			messages: [
				{ content: buildSystemPrompt(), role: 'system' },
				{ content: userContent, role: 'user' },
			],
			num_ctx: overrides?.num_ctx ?? config.num_ctx,
			onChunk: (text) => {
				raw += text;
			},
			temperature: overrides?.temperature ?? config.temperature,
		});

		try {
			return config.outputSchema.parse(extractJson(raw)) as z.infer<T>;
		} catch {
			throw new LLMParseError('LLM did not return valid JSON', raw);
		}
	};

	return { run };
};

export type PromptRunner = {
	run: (
		content: string,
		overrides?: { temperature?: number; num_ctx?: number },
	) => Promise<Record<string, unknown>>;
};
