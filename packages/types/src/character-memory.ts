import { z } from "zod";

export const CharacterMemoryRelationSchema = z.object({
  memoryid: z.string(),
  characterId: z.string(),
});
export type CharacterMemoryRelation = z.infer<
  typeof CharacterMemoryRelationSchema
>;
