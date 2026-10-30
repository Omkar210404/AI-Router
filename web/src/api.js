async function json(path, opts) {
  const r = await fetch(path, opts)
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body.detail || `Request failed (${r.status})`)
  return body
}

export const api = {
  models: () => json('/api/models'),
  providers: () => json('/api/providers'),
  testProvider: (name) => json(`/api/providers/${name}/test`, { method: 'POST' }),
  conversations: () => json('/api/conversations'),
  conversation: (id) => json(`/api/conversations/${id}`),
  deleteConversation: (id) => json(`/api/conversations/${id}`, { method: 'DELETE' }),
  route: (text) => json('/api/route', post({ text })),
  routing: () => json('/api/routing'),
}

function post(body) {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

// POST /api/chat and read the server-sent events as they arrive.
export async function streamChat(body, onEvent, signal) {
  const r = await fetch('/api/chat', { ...post(body), signal })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err.detail || `Request failed (${r.status})`)
  }
  const reader = r.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let i
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i)
      buf = buf.slice(i + 2)
      const event = /^event: (.*)$/m.exec(block)?.[1]
      const data = /^data: (.*)$/m.exec(block)?.[1]
      if (event && data) onEvent(event, JSON.parse(data))
    }
  }
}
