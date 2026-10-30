import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api.js'
import { REPO_URL } from './demo.js'
import { Icon, Markdown, ModelBadge, ProviderMark, TierTag, fmtMs } from './ui.jsx'

const SUGGESTIONS = [
  { title: 'Debug some code', text: 'Why does this Python code print None?\n\n```python\ndef add(a, b):\n    print(a + b)\n\nprint(add(2, 3))\n```' },
  { title: 'Quick fact', text: 'What is the capital of Australia?' },
  { title: 'Write something', text: 'Write a short poem about a city waking up in the rain.' },
  { title: 'Think it through', text: 'Compare SQLite and PostgreSQL for a small side project and recommend one, step by step.' },
]

const AUTO = { id: 'auto', label: 'Auto', provider: 'auto' }

export function ModelPicker({ models, value, onChange, up = true }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const current = value === 'auto' ? AUTO : models.find((m) => m.id === value)
  const groups = [...new Set(models.map((m) => m.provider_label))]
  const pick = (id) => { onChange(id); setOpen(false) }
  return (
    <div className="picker" ref={ref}>
      <button className="picker-btn" onClick={() => setOpen(!open)} aria-haspopup="listbox">
        <ProviderMark provider={current?.provider} />
        <span>{current?.label || 'Choose a model'}</span>
        <i className="chev">{Icon.chevron}</i>
      </button>
      {open && (
        <div className={`picker-menu ${up ? '' : 'down'}`} role="listbox">
          <button role="option" aria-selected={value === 'auto'} className={`picker-item ${value === 'auto' ? 'on' : ''}`}
            onClick={() => pick('auto')}>
            <ProviderMark provider="auto" />
            <span className="grow">Auto<span className="picker-desc">The router picks a model for each message</span></span>
          </button>
          {groups.map((g) => (
            <div key={g}>
              <div className="picker-group">{g}</div>
              {models.filter((m) => m.provider_label === g).map((m) => (
                <button key={m.id} role="option" aria-selected={m.id === value} disabled={!m.configured}
                  className={`picker-item ${m.id === value ? 'on' : ''}`} onClick={() => pick(m.id)}>
                  <ProviderMark provider={m.provider} />
                  <span className="grow">{m.label}{m.speed && m.speed !== 'local' && <span className="picker-desc">{m.speed}</span>}</span>
                  {m.configured ? <TierTag tier={m.tier} /> : <span className="muted small">not configured</span>}
                </button>
              ))}
            </div>
          ))}
          {!models.length && <div className="picker-group">Loading models…</div>}
        </div>
      )}
    </div>
  )
}

function RouteWhy({ route }) {
  return (
    <div className="route-why">
      <div>{route.reason}</div>
      {route.note && <div className="muted">{route.note}</div>}
      {route.signals?.length > 0 && (
        <div className="chips">
          <span className="muted small">Signals:</span>
          {route.signals.map((s) => <code key={s}>{s.replace(/^pattern /, '/') + (s.startsWith('pattern ') ? '/' : '')}</code>)}
        </div>
      )}
    </div>
  )
}

function Meta({ m }) {
  const bits = [
    fmtMs(m.latency_ms) && `${fmtMs(m.latency_ms)} total`,
    fmtMs(m.first_token_ms) && `first token ${fmtMs(m.first_token_ms)}`,
    m.tokens_in != null && `${m.tokens_in} in / ${m.tokens_out} out tokens`,
  ].filter(Boolean)
  return bits.length ? <div className="meta">{bits.join(' · ')}{m.stopped ? ' · stopped' : ''}</div> : null
}

function Message({ m, route, models, onRetry }) {
  const [why, setWhy] = useState(false)
  if (m.role === 'user') {
    return <div className="msg user"><div className="bubble">{m.content}</div></div>
  }
  const tier = models.find((x) => x.id === m.model)?.tier
  return (
    <div className="msg assistant">
      <div className="msg-head">
        <ModelBadge model={m.model} models={models} />
        {route && (
          <button className={`route-tag ${why ? 'on' : ''}`} onClick={() => setWhy(!why)} title="Why this model?">
            <ProviderMark provider="auto" size={12} /> {route.overridden ? 'Overrode router' : 'Routed'} · {route.label}
          </button>
        )}
        {tier === 'paid' && <TierTag tier="paid" />}
      </div>
      {why && route && <RouteWhy route={route} />}
      {m.demo && (
        <div className="demo-card">
          This is the static demo on GitHub Pages, so no AI is called here. In the real app,{' '}
          <strong>{models.find((x) => x.id === m.model)?.label || m.model}</strong> would stream its answer now.
          To chat for real, run AIRouter on your computer with a free Gemini or Groq key (steps in the{' '}
          <a href={REPO_URL} target="_blank" rel="noreferrer">README</a>).
        </div>
      )}
      {m.content ? <Markdown text={m.content} /> : !m.error && !m.demo && <div className="typing"><i /><i /><i /></div>}
      {m.streaming && m.content && <span className="caret" />}
      {m.error && (
        <div className="error-card">
          <strong>No reply.</strong> {m.error}
          {onRetry && <button className="link" onClick={onRetry}>Try again</button>}
        </div>
      )}
      {!m.streaming && <Meta m={m} />}
    </div>
  )
}

// Show a divider wherever the answering model changes mid-thread.
function withDividers(messages, models) {
  const out = []
  let last = null
  messages.forEach((m, i) => {
    const next = m.role === 'user' ? messages[i + 1] : null
    if (next?.role === 'assistant' && last && next.model !== last) {
      const name = (id) => models.find((x) => x.id === id)?.label || id.split(':').slice(1).join(':')
      out.push({ divider: `Switched from ${name(last)} to ${name(next.model)} · full conversation passed along`, key: `d${i}` })
    }
    if (m.role === 'assistant') last = m.model
    out.push({ m, i, route: m.role === 'assistant' ? messages[i - 1]?.route : null })
  })
  return out
}

export default function Chat({ messages, models, model, setModel, onSend, onStop, streaming, header, emptyNote }) {
  const [text, setText] = useState('')
  const [route, setRoute] = useState(null)
  const [override, setOverride] = useState('')
  const [why, setWhy] = useState(false)
  const end = useRef(null)
  const box = useRef(null)
  const auto = model === 'auto'
  const configured = models.filter((m) => m.configured)

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [messages])
  useEffect(() => {
    const t = box.current
    if (t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 220) + 'px' }
  }, [text])
  // Live recommendation while typing in Auto mode.
  useEffect(() => {
    if (!auto || text.trim().length < 3) { setRoute(null); return }
    const t = setTimeout(() => api.route(text).then((r) => { setRoute({ ...r, text }); setOverride('') }).catch(() => {}), 300)
    return () => clearTimeout(t)
  }, [text, auto])

  const send = async (value = text) => {
    if (!value.trim() || streaming) return
    let chosen = model
    let r = null
    if (auto) {
      r = route?.text === value ? route : await api.route(value).catch(() => null)
      chosen = override || r?.model
      if (!chosen) return onSend(value, { error: 'The router found no configured model. Open Settings to set one up.' })
      r = { label: r.label, category: r.category, reason: r.reason, note: r.note, signals: r.signals, model: r.model, overridden: !!override && override !== r.model }
    }
    onSend(value, { model: chosen, route: r })
    setText('')
    setWhy(false)
  }
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  const items = useMemo(() => withDividers(messages, models), [messages, models])

  return (
    <section className="chat">
      {header}
      <div className="thread">
        {!messages.length ? (
          <div className="empty">
            <div className="empty-logo">{Icon.chat}</div>
            <h1>What do you want to ask?</h1>
            <p className="muted">Pick a model, or leave it on Auto and the router will suggest one and say why.</p>
            {emptyNote}
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s.title} onClick={() => send(s.text)} disabled={streaming || !configured.length}>
                  <strong>{s.title}</strong>
                  <span>{s.text.split('\n')[0]}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="messages">
            {items.map((it) => it.divider
              ? <div key={it.key} className="divider"><span>{it.divider}</span></div>
              : <Message key={it.m.id || `t${it.i}`} m={it.m} route={it.route} models={models}
                onRetry={it.m.error && it.i === messages.length - 1 ? () => onSend(lastUser.content, { retry: true, model: it.m.model, route: lastUser.route }) : null} />)}
            <div ref={end} />
          </div>
        )}
      </div>
      <div className="composer-wrap">
        <div className="composer">
          {auto && route && (
            <div className="route-strip">
              <div className="route-line">
                <span className="route-cat"><ProviderMark provider="auto" size={13} />{route.label}</span>
                <span className="muted">→</span>
                {route.model ? <ModelBadge model={override || route.model} models={models} /> : <span className="muted small">no configured model</span>}
                <button className="link small" onClick={() => setWhy(!why)}>{why ? 'Hide why' : 'Why?'}</button>
                <select className="override" value={override} onChange={(e) => setOverride(e.target.value)} title="Override the router">
                  <option value="">{route.model ? 'Accept suggestion' : 'Pick a model'}</option>
                  {configured.filter((m) => m.id !== route.model).map((m) => <option key={m.id} value={m.id}>Use {m.label}</option>)}
                </select>
              </div>
              {why && <RouteWhy route={route} />}
            </div>
          )}
          <textarea ref={box} rows={1} value={text} placeholder="Message AIRouter…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
          <div className="composer-bar">
            <ModelPicker models={models} value={model} onChange={setModel} />
            {streaming
              ? <button className="send stop" onClick={onStop} title="Stop">{Icon.stop}</button>
              : <button className="send" onClick={() => send()} disabled={!text.trim()} title="Send">{Icon.send}</button>}
          </div>
        </div>
        <div className="hint muted">Enter to send · Shift+Enter for a new line · Switch models any time: the new one gets the whole conversation</div>
      </div>
    </section>
  )
}
