import { OllamaMessageSchema } from "@simplechat/types";
import { z } from "zod";

export const streamOptionsSchema = z.object({
  messages: z.array(OllamaMessageSchema),
  model: z.string(),
  temperature: z.number(),
  top_p: z.number(),
  top_k: z.number(),
  repeat_penalty: z.number(),
  num_predict: z.number(),
  num_ctx: z.number(),
  onChunk: z.function().args(z.string()).returns(z.void()),
  signal: z
    .custom<AbortSignal>(
      (value) =>
        typeof AbortSignal !== "undefined" && value instanceof AbortSignal,
    )
    .optional(),
});

export type StreamOptions = z.infer<typeof streamOptionsSchema>;
