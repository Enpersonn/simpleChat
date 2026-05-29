import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { defineTool, type FunctionTool } from '@llm-helpers/tools';
import { z } from 'zod';
import { dataDir } from '../config.js';
import { now, readJson, writeJson } from './helpers.js';

type Filter<T> = Partial<{
	[K in keyof T]: T[K] | ((value: T[K], item: T) => boolean);
}>;

export class BaseStorageObject<TSchema extends z.ZodType<any>> {
	public dataType: string;
	public dataSchema: TSchema;

	constructor(dataType: string, dataSchema: TSchema) {
		this.dataType = dataType;
		this.dataSchema = dataSchema;
	}

	private async dataPath() {
		return join(await dataDir(), this.dataType, 'store.json');
	}

	private async fetchDatabase() {
		const path = await this.dataPath();
		const raw = await readJson<unknown[]>(path, []);

		return raw
			.map((r) => this.dataSchema.safeParse(r))
			.filter((r) => r.success)
			.map((r) => r.data);
	}

	public async get(id: string): Promise<z.infer<TSchema> | null> {
		const table = await this.fetchDatabase();
		return table.find((c) => c.id === id) ?? null;
	}

	public async list(
		filters?: Filter<z.infer<TSchema>>,
	): Promise<z.infer<TSchema>[]> {
		const table = await this.fetchDatabase();

		if (!filters) return table;

		return table.filter((item) =>
			Object.entries(filters).every(([key, expected]) => {
				const value = item[key as keyof typeof item];

				if (typeof expected === 'function') {
					return expected(value, item);
				}

				return value === expected;
			}),
		);
	}

	public async update(
		id: string,
		body: Partial<z.infer<TSchema>>,
	): Promise<z.infer<TSchema> | null> {
		const table = await this.fetchDatabase();
		const idx = table.findIndex((c) => c.id === id);

		if (idx === -1) return null;

		const updated = this.dataSchema.parse({
			...table[idx],
			...body,
			id,
			updatedAt: now(),
		});

		table[idx] = updated;
		await writeJson(await this.dataPath(), table);

		return updated;
	}

	public async add(body: Record<string, unknown>): Promise<z.infer<TSchema>> {
		const table = await this.fetchDatabase();

		const newItem = this.dataSchema.parse({
			...body,
			createdAt: now(),
			id: randomUUID(),
			updatedAt: now(),
		});

		table.push(newItem);
		await writeJson(await this.dataPath(), table);

		return newItem;
	}

	public async replaceAll(items: z.infer<TSchema>[]): Promise<void> {
		await writeJson(await this.dataPath(), items);
	}

	public async delete(id: string): Promise<boolean> {
		const table = await this.fetchDatabase();
		const updatedTable = table.filter((item) => item.id !== id);

		if (updatedTable.length === table.length) return false;

		await writeJson(await this.dataPath(), updatedTable);
		return true;
	}

	public asReadTools(): FunctionTool[] {
		const t = this.dataType;
		return [
			defineTool({
				description: `Get a single ${t} record by id`,
				execute: ({ id }, _ctx) => this.get(id),
				input: z.object({ id: z.string() }),
				name: `${t}.get`,
			}),
			defineTool({
				description: `List all ${t} records, optionally filtered by field values`,
				execute: ({ filters }, _ctx) =>
					this.list(filters as Filter<z.infer<TSchema>>),
				input: z.object({
					filters: z.record(z.string(), z.unknown()).optional(),
				}),
				name: `${t}.list`,
			}),
		];
	}

	public asWriteTools(): FunctionTool[] {
		const t = this.dataType;
		return [
			defineTool({
				description: `Create a new ${t} record`,
				execute: ({ body }, _ctx) => this.add(body),
				input: z.object({ body: z.record(z.string(), z.unknown()) }),
				name: `${t}.add`,
			}),
			defineTool({
				description: `Update an existing ${t} record by id`,
				execute: ({ id, body }, _ctx) =>
					this.update(id, body as Partial<z.infer<TSchema>>),
				input: z.object({
					body: z.record(z.string(), z.unknown()),
					id: z.string(),
				}),
				name: `${t}.update`,
			}),
			defineTool({
				description: `Delete a ${t} record by id`,
				execute: ({ id }, _ctx) => this.delete(id),
				input: z.object({ id: z.string() }),
				name: `${t}.delete`,
			}),
		];
	}

	public asTools(): FunctionTool[] {
		return [...this.asReadTools(), ...this.asWriteTools()];
	}
}
