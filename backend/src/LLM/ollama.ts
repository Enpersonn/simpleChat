import type { OllamaMessage, OllamaModel } from "@simplechat/types";
import { getSettings } from "../config.js";

export async function ollamaEndpoint(): Promise<string> {
  const s = await getSettings();
  // Node.js fetch resolves 'localhost' to ::1 (IPv6) on Windows but Ollama
  // typically listens on 127.0.0.1 only, so normalise to avoid connection failures.
  return s.ollamaEndpoint
    .replace(/\/+$/, "")
    .replace(
      /^(https?:\/\/)localhost(:\d+)?/,
      (_, scheme, port) => `${scheme}127.0.0.1${port ?? ""}`,
    );
}

export async function activeModel(): Promise<string> {
  const s = await getSettings();
  return s.activeModel;
}

export async function listModels(): Promise<OllamaModel[]> {
  const endpoint = await ollamaEndpoint();
  const res = await fetch(`${endpoint}/api/tags`);
  if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
  const data = (await res.json()) as { models: OllamaModel[] };
  return data.models ?? [];
}

export async function healthCheck(): Promise<boolean> {
  try {
    const endpoint = await ollamaEndpoint();
    const res = await fetch(`${endpoint}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface StreamOptions {
  messages: OllamaMessage[];
  model?: string;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  repeat_penalty?: number;
  num_predict?: number;
  num_ctx?: number;
  onChunk: (text: string) => void;
  signal?: AbortSignal;
}

export async function streamChat(opts: StreamOptions): Promise<string> {
  const endpoint = await ollamaEndpoint();
  const model = opts.model || (await activeModel());

  const body = {
    model,
    messages: opts.messages,
    stream: true,
    options: {
      temperature: opts.temperature ?? 0.85,
      top_p: opts.top_p ?? 0.9,
      top_k: opts.top_k ?? 40,
      repeat_penalty: opts.repeat_penalty ?? 1.1,
      ...(opts.num_predict ? { num_predict: opts.num_predict } : {}),
      ...(opts.num_ctx ? { num_ctx: opts.num_ctx } : {}),
    },
  };

  const res = await fetch(`${endpoint}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error ${res.status}: ${err}`);
  }

  if (!res.body) throw new Error("No response body from Ollama");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const chunk = JSON.parse(line) as {
          message?: { content?: string };
          done?: boolean;
        };
        const text = chunk.message?.content ?? "";
        if (text) {
          fullText += text;
          opts.onChunk(text);
        }
      } catch {
        // skip malformed chunk
      }
    }
  }
  return fullText;
}
