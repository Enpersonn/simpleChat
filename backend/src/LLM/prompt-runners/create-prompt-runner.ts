import { extractJson } from "../../utils";
import { LLMParseError } from "../generate";
import { streamChat } from "../ollama";

export const createPromptRunner = (config: {
  role: string;
  instructions: string;
  outputShape: string;
  temperature: number;
  num_ctx?: number;
}) => {
  const buildSystemPrompt = (): string => {
    return [
      `You are a ${config.role}. Your ONLY job is to output a single JSON object — nothing else.`,
      "Do NOT write any analysis, explanation, commentary, or prose.",
      "Do NOT use markdown or code fences.",
      config.instructions,
      "Output ONLY the raw JSON object below, with no text before or after it:",
      config.outputShape,
    ].join("\n");
  };

  const run = async (
    userContent: string,
    overrides?: { temperature?: number; num_ctx?: number },
  ): Promise<Record<string, unknown>> => {
    let raw = "";
    await streamChat({
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: userContent },
      ],
      temperature: overrides?.temperature ?? config.temperature,
      num_ctx: overrides?.num_ctx ?? config.num_ctx,
      onChunk: (text) => {
        raw += text;
      },
    });

    try {
      return extractJson(raw) as Record<string, unknown>;
    } catch {
      throw new LLMParseError("LLM did not return valid JSON", raw);
    }
  };

  return {
    run,
  };
};

export type PromptRunner = ReturnType<typeof createPromptRunner>;
