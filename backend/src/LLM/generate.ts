import { extractJson } from "../utils.js";
import { streamChat } from "./ollama.js";

export class LLMParseError extends Error {
  readonly raw: string;
  constructor(message: string, raw: string) {
    super(message);
    this.raw = raw;
  }
}

export class LLMAgent {
  private readonly config: {
    role: string;
    instructions: string;
    outputShape: string;
    temperature: number;
    num_ctx?: number;
  };

  constructor(config: {
    role: string;
    instructions: string;
    outputShape: string;
    temperature: number;
    num_ctx?: number;
  }) {
    this.config = config;
  }

  buildSystemPrompt(): string {
    return [
      `You are a ${this.config.role}. Your ONLY job is to output a single JSON object — nothing else.`,
      "Do NOT write any analysis, explanation, commentary, or prose.",
      "Do NOT use markdown or code fences.",
      this.config.instructions,
      "Output ONLY the raw JSON object below, with no text before or after it:",
      this.config.outputShape,
    ].join("\n");
  }

  async run(
    userContent: string,
    overrides?: { temperature?: number; num_ctx?: number },
  ): Promise<Record<string, unknown>> {
    let raw = "";
    await streamChat({
      messages: [
        { role: "system", content: this.buildSystemPrompt() },
        { role: "user", content: userContent },
      ],
      temperature: overrides?.temperature ?? this.config.temperature,
      num_ctx: overrides?.num_ctx ?? this.config.num_ctx,
      onChunk: (text) => {
        raw += text;
      },
    });

    try {
      return extractJson(raw) as Record<string, unknown>;
    } catch {
      throw new LLMParseError("LLM did not return valid JSON", raw);
    }
  }
}
