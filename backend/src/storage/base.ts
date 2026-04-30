import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { type ZodTypeAny, z } from "zod";
import { dataDir } from "../config";
import type { Tool } from "../LLM/tools/register-tool";
import { now, readJson, writeJson } from "./helpers";

type Filter<T> = Partial<{
  [K in keyof T]: T[K] | ((value: T[K], item: T) => boolean);
}>;

export class BaseStorageObject<TSchema extends ZodTypeAny> {
  public dataType: string;
  public dataSchema: TSchema;

  constructor(dataType: string, dataSchema: TSchema) {
    this.dataType = dataType;
    this.dataSchema = dataSchema;
  }

  private async dataPath() {
    return join(await dataDir(), this.dataType, "store.json");
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

        if (typeof expected === "function") {
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
      id: randomUUID(),
      createdAt: now(),
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

  public asTools(): Tool<any, any>[] {
    const t = this.dataType;
    return [
      {
        name: `${t}.get`,
        description: `Get a single ${t} record by id`,
        schema: z.object({ id: z.string() }),
        execute: ({ id }: { id: string }) => this.get(id),
      },
      {
        name: `${t}.list`,
        description: `List all ${t} records, optionally filtered by field values`,
        schema: z.object({ filters: z.record(z.unknown()).optional() }),
        execute: ({ filters }: { filters?: Record<string, unknown> }) =>
          this.list(filters as Filter<z.infer<TSchema>>),
      },
      {
        name: `${t}.add`,
        description: `Create a new ${t} record`,
        schema: z.object({ body: z.record(z.unknown()) }),
        execute: ({ body }: { body: Record<string, unknown> }) => this.add(body),
      },
      {
        name: `${t}.update`,
        description: `Update an existing ${t} record by id`,
        schema: z.object({ id: z.string(), body: z.record(z.unknown()) }),
        execute: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
          this.update(id, body),
      },
      {
        name: `${t}.delete`,
        description: `Delete a ${t} record by id`,
        schema: z.object({ id: z.string() }),
        execute: ({ id }: { id: string }) => this.delete(id),
      },
    ];
  }
}
