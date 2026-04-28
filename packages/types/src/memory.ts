import { z } from "zod";

export const DeltaValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string()),
  z.record(z.unknown()),
]);

export const DeltaOperationSchema = z.enum([
  "set",
  "unset",
  "add",
  "remove",
  "increment",
  "decrement",
]);

export const MemoryDeltaEffectSchema = z.object({
  path: z.string().min(1),
  op: DeltaOperationSchema,
  value: DeltaValueSchema.optional(),
  weight: z.number().min(0).max(1).default(1),
  scope: z
    .enum(["Memory", "relationship", "location", "memory"])
    .default("Memory"),
  targetId: z.string().optional(),
});

export const MemoryDeltaSchema = z.object({
  effects: z.array(MemoryDeltaEffectSchema).default([]),
});

export type MemoryDelta = z.infer<typeof MemoryDeltaSchema>;
export type MemoryDeltaEffect = z.infer<typeof MemoryDeltaEffectSchema>;

export const MemoryItemSchema = z.object({
  id: z.string(),
  storyId: z.string(),
  MemoryId: z.string(),
  summary: z.string().min(1),
  tags: z.array(z.string()).default([]),
  importance: z.number().min(0).max(1).default(0.5),

  locationId: z.string().optional(),
  sourceChatId: z.string().optional(),
  sourceTurnId: z.string().optional(),
  previousMemoryId: z.string().optional(),
  branchLabel: z.string().optional(),

  deltas: MemoryDeltaSchema.default({ effects: [] }),

  createdAt: z.string(),
  updatedAt: z.string(),
});

export const MemoryItemCreateSchema = MemoryItemSchema.omit({
  id: true,
  storyId: true,
  createdAt: true,
  updatedAt: true,
});
export type MemoryItem = z.infer<typeof MemoryItemSchema>;
