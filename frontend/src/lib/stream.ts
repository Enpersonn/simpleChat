export interface DebugInfo {
  systemPrompt: string
  model: string
}

export interface StreamOptions {
  storyId: string
  chatId: string
  body: object
  onChunk: (text: string) => void
  onDone: () => void
  onError: (msg: string) => void
  onDebug?: (info: DebugInfo) => void
  signal?: AbortSignal
}

async function readStream(
  res: Response,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (msg: string) => void,
  onDebug?: (info: DebugInfo) => void,
): Promise<void> {
  if (!res.body) { onError(`Request failed: ${res.status}`); return }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    let done: boolean
    let value: Uint8Array | undefined
    try {
      ;({ done, value } = await reader.read())
    } catch {
      break
    }
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const msg = JSON.parse(line) as { content?: string; done?: boolean; error?: string; debug?: DebugInfo }
        if (msg.debug) { onDebug?.(msg.debug); continue }
        if (msg.error) { onError(msg.error); return }
        if (msg.content) onChunk(msg.content)
        if (msg.done) { onDone(); return }
      } catch {
        // skip malformed line
      }
    }
  }
  onDone()
}

export async function sendMessageStream(opts: StreamOptions): Promise<void> {
  const { storyId, chatId, body, onChunk, onDone, onError, onDebug, signal } = opts

  let res: Response
  try {
    res = await fetch(`/stories/${storyId}/chats/${chatId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') return
    onError((err as Error).message)
    return
  }

  if (!res.ok || !res.body) { onError(`Request failed: ${res.status}`); return }
  await readStream(res, onChunk, onDone, onError, onDebug)
}

export async function openerStream(
  storyId: string,
  chatId: string,
  handlers: Pick<StreamOptions, 'onChunk' | 'onDone' | 'onError' | 'onDebug' | 'signal'>,
): Promise<void> {
  let res: Response
  try {
    res = await fetch(`/stories/${storyId}/chats/${chatId}/opener`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: handlers.signal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') return
    handlers.onError((err as Error).message)
    return
  }
  if (!res.ok || !res.body) { handlers.onError(`Request failed: ${res.status}`); return }
  await readStream(res, handlers.onChunk, handlers.onDone, handlers.onError, handlers.onDebug)
}

export async function regenerateStream(opts: StreamOptions): Promise<void> {
  const { storyId, chatId, body, onChunk, onDone, onError, onDebug, signal } = opts

  let res: Response
  try {
    res = await fetch(`/stories/${storyId}/chats/${chatId}/regenerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') return
    onError((err as Error).message)
    return
  }

  if (!res.ok || !res.body) { onError(`Request failed: ${res.status}`); return }
  await readStream(res, onChunk, onDone, onError, onDebug)
}
