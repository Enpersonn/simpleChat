//nomic-embed-text

import { ollamaEndpoint } from "../ollama";

export const embedText = async (text: string) => {
  const endpoint = await ollamaEndpoint();

  const body = {
    model: "nomic-embed-text",
    stream: false,
  };

  const res = await fetch(`${endpoint}/api/chat`, {
    method: "POST",
    messages: [],
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error ${res.status}: ${err}`);
  }

  if (!res.body) throw new Error("No response body from Ollama");
};
