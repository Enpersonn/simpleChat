import {
  activeModel,
  ollamaEndpoint,
  type StreamOptions,
} from "../../../ollama";

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
