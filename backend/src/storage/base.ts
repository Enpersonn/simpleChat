import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { ZodTypeAny, z } from "zod";
import { dataDir } from "../config";
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
    const item = table.find((c) => c.id === id) ?? null;

    if (item === -1) return null;
    const updated = this.dataSchema.parse({
      ...table[item],
      ...body,
      id: id,
      updatedAt: now(),
    });

    table[item] = updated;
    await writeJson(await this.dataPath(), table);

    return updated;
  }

  public async add<T extends ZodTypeAny>(
    body: z.infer<T>,
  ): Promise<z.infer<TSchema>> {
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

  public async delete(id: string): Promise<boolean> {
    const table = await this.fetchDatabase();
    const updatedTable = table.filter((item) => item.id !== id);

    if (updatedTable.length === table.length) return false;

    await writeJson(await this.dataPath(), updatedTable);
    return true;
  }
}
