import type { ZodTypeAny } from "zod";
import { streamChat } from "./ollama";

export class GenerateAgent<TSchema extends ZodTypeAny> {
  private systemPrompt: string;
  private expectedOutput: TSchema;
  private exampleOutput?: string;

  constructor({
    systemPrompt,
    expectedOutput,
    exampleOutput,
  }: {
    systemPrompt: string[];
    expectedOutput: TSchema;
    exampleOutput?: string[];
  }) {
    this.systemPrompt = systemPrompt.join("\n");
    this.expectedOutput = expectedOutput;
    this.exampleOutput =
      exampleOutput &&
      ["Return exactly this JSON shape:", ...exampleOutput]?.join("\n");
  }

  private validateRes(raw: string) {
    try {
      const data = this.expectedOutput.safeParse(raw);
      return data;
    } catch {
      throw "error: response data did not match expected output";
    }
  }

  private getSystemPrompt() {
    return [this.systemPrompt, this.exampleOutput].join("\n");
  }

  public async streamResponse(req: string, ctx?: string) {
    const content = `${ctx ? `${ctx}\n\n` : ""} ${req.trim()}`;

    let raw = "";

    await streamChat({
      messages: [
        { role: "system", content: this.getSystemPrompt() },
        {
          role: "user",
          content,
        },
      ],
      temperature: 0.85,
      onChunk: (text) => {
        raw += text;
      },
    });

    return this.validateRes(raw);
  }
}
