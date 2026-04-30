import { LLMParseError } from "./agents/generate";

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function handleLLMError(
  err: unknown,
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
) {
  if (err instanceof LLMParseError)
    return reply
      .status(422)
      .send({ error: "LLM did not return valid JSON", raw: err.raw });
  throw err;
}
