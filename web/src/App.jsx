import { useCallback, useEffect, useRef, useState } from 'react'
import { api, streamChat } from './api.js'
import Chat from './Chat.jsx'
import Settings from './Settings.jsx'
import { Icon, timeAgo } from './ui.jsx'

const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d } catch { return d } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
}

export default function App() {
  const [theme, setTheme] = useState(store.get('theme', 'dark'))
  const [view, setView] = useState('chat')
  const [models, setModels] = useState([])
  const [model, setModelState] = useState(store.get('model', 'auto'))
  const [convs, setConvs] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [streaming, setStreaming] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [loadError, setLoadError] = useState('')
  const abort = useRef(null)

  useEffect(() => { document.documentElement.dataset.theme = theme; store.set('theme', theme) }, [theme])

  const refreshConvs = useCallback(() => api.conversations().then(setConvs).catch(() => {}), [])
  const refreshModels = useCallback(() => api.models().then((ms) => {
    setModels(ms)
    setLoadError('')
    setModelState((cur) => (cur === 'auto' || ms.find((m) => m.id === cur && m.configured) ? cur : 'auto'))
  }).catch((e) => setLoadError(e.message)), [])
  useEffect(() => { refreshModels(); refreshConvs() }, [refreshModels, refreshConvs])
  // #c/<id> opens a conversation, #settings opens settings, so links can be bookmarked.
  useEffect(() => {
    const h = window.location.hash
    if (h === '#settings') setView('settings')
    else if (h.startsWith('#c/')) open(h.slice(3))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const h = view === 'settings' ? '#settings' : activeId ? `#c/${activeId}` : ''
    if (window.location.hash !== h) window.history.replaceState(null, '', h || window.location.pathname)
  }, [view, activeId])

  const setModel = (id) => { setModelState(id); store.set('model', id) }

  const open = async (id) => {
    setNavOpen(false)
    setView('chat')
    if (streaming) return
    setActiveId(id)
    const conv = await api.conversation(id).catch(() => null)
    setMessages(conv ? conv.messages : [])
  }
  const newChat = () => { if (!streaming) { setActiveId(null); setMessages([]); setNavOpen(false); setView('chat') } }
  const remove = async (id, e) => {
    e.stopPropagation()
    await api.deleteConversation(id)
    if (id === activeId) newChat()
    refreshConvs()
  }

  const send = async (text, { model: chosen, route = null, retry = false, error = null } = {}) => {
    const draft = { role: 'assistant', content: '', model: chosen, streaming: !error, error }
    setMessages((ms) => [...(retry ? ms.slice(0, -1) : ms), ...(retry ? [] : [{ role: 'user', content: text, route }]), draft])
    if (error || !chosen) return
    const patchDraft = (fn) => setMessages((ms) => [...ms.slice(0, -1), fn(ms[ms.length - 1])])
    setStreaming(true)
    abort.current = new AbortController()
    try {
      await streamChat({ text, model: chosen, conversation_id: activeId, route, retry }, (event, data) => {
        if (event === 'meta') {
          setActiveId(data.conversation_id)
          refreshConvs()
        } else if (event === 'token') {
          patchDraft((d) => ({ ...d, content: d.content + data.text }))
        } else if (event === 'done') {
          patchDraft(() => data)
        } else if (event === 'error') {
          patchDraft((d) => ({ ...d, streaming: false, error: data.message }))
        }
      }, abort.current.signal)
    } catch (e) {
      const stopped = e.name === 'AbortError'
      patchDraft((d) => ({ ...d, streaming: false, stopped, error: stopped ? null : e.message }))
    } finally {
      setStreaming(false)
      refreshConvs()
    }
  }

  const configured = models.filter((m) => m.configured)
  const emptyNote = loadError
    ? <div className="notice error">Can't reach the AIRouter server: {loadError}</div>
    : models.length && !configured.length
      ? <div className="notice">No provider is set up yet. Add a free <code>GEMINI_API_KEY</code> to <code>.env</code>, or start Ollama, then check <button className="link" onClick={() => setView('settings')}>Settings</button>.</div>
      : null
  const title = convs.find((c) => c.id === activeId)?.title
  const topbar = (label) => (
    <header className="topbar">
      <button className="icon-btn mobile-only" onClick={() => setNavOpen(true)}>{Icon.menu}</button>
      <div className="top-title">{label}</div>
    </header>
  )

  return (
    <div className={`app ${navOpen ? 'nav-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="logo"><svg viewBox="0 0 24 24"><path d="M6 17l6-10 6 10" /></svg></span>
          AIRouter
        </div>
        <button className="new-chat" onClick={newChat}>{Icon.plus} New chat</button>
        <div className="conv-list">
          {convs.length === 0 && <div className="muted small pad">Your conversations will show up here.</div>}
          {convs.map((c) => (
            <div key={c.id} className={`conv ${c.id === activeId && view === 'chat' ? 'on' : ''}`} onClick={() => open(c.id)}>
              <div className="grow">
                <div className="conv-title">{c.title}</div>
                <div className="muted small">{timeAgo(c.updated_at)}</div>
              </div>
              <button className="icon-btn ghost" onClick={(e) => remove(c.id, e)} title="Delete">{Icon.trash}</button>
            </div>
          ))}
        </div>
        <div className="side-foot">
          <button className={`side-btn ${view === 'settings' ? 'on' : ''}`} onClick={() => { setView('settings'); setNavOpen(false) }}>
            {Icon.gear} Settings
          </button>
          <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title="Toggle theme">{theme === 'dark' ? Icon.sun : Icon.moon}</button>
        </div>
      </aside>
      <div className="scrim" onClick={() => setNavOpen(false)} />
      <main>
        {view === 'settings' ? (
          <div className="chat">
            {topbar('Settings')}
            <div className="thread"><Settings models={models} onChange={refreshModels} /></div>
          </div>
        ) : (
          <Chat messages={messages} models={models} model={model} setModel={setModel}
            onSend={send} onStop={() => abort.current?.abort()} streaming={streaming} emptyNote={emptyNote}
            header={topbar(title || 'New chat')} />
        )}
      </main>
    </div>
  )
}
