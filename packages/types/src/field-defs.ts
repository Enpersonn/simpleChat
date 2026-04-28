import { z } from "zod";

export const EntityFieldDefSchema = z.object({
  id: z.string(),
  storyId: z.string(),
  entityType: z.string().min(1),
  path: z.string().min(1),
  label: z.string().min(1),
  valueType: z.enum(["string", "string_array", "number"]),
  suggestedOps: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const EntityFieldDefCreateSchema = EntityFieldDefSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const EntityFieldDefUpdateSchema = EntityFieldDefCreateSchema.partial();

export type EntityFieldDef = z.infer<typeof EntityFieldDefSchema>;
export type EntityFieldDefCreate = z.infer<typeof EntityFieldDefCreateSchema>;
export type EntityFieldDefUpdate = z.infer<typeof EntityFieldDefUpdateSchema>;
