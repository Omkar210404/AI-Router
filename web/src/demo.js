// Stand-in for the backend on GitHub Pages. Answers from demo-data.json, which
// `python -m airouter export-demo` writes from real conversations. No AI is called.
import data from './demo-data.json'
import { route } from './router.js'

export const REPO_URL = 'https://github.com/Omkar210404/AI-Router'

const deleted = new Set()
// Shift recorded timestamps so the newest chat reads as "just now".
const shift = () => Date.now() / 1000 - Math.max(...data.conversations.map((c) => c.updated_at))
const conv = (c) => ({ ...c, created_at: c.created_at + shift(), updated_at: c.updated_at + shift() })

export const demoApi = {
  models: async () => data.models,
  providers: async () => data.providers,
  testProvider: async () => ({
    ok: false,
    detail: 'This is the static demo, so there is no server to test from. Run AIRouter on your computer with your own key to test it.',
  }),
  conversations: async () => data.conversations.filter((c) => !deleted.has(c.id))
    .map(({ messages, ...c }) => conv(c)), // eslint-disable-line no-unused-vars
  conversation: async (id) => {
    const c = data.conversations.find((x) => x.id === id)
    if (!c) throw new Error('Conversation not found')
    return conv(c)
  },
  deleteConversation: async (id) => { deleted.add(id); return { ok: true } },
  route: async (text) => route(text, data.models, data.routing.categories),
  routing: async () => data.routing,
}
