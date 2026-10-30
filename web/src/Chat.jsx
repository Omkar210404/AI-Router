import { useEffect, useRef, useState } from 'react'
import { Icon, Markdown, ModelBadge, ProviderMark, TierTag, fmtMs } from './ui.jsx'

const SUGGESTIONS = [
  { title: 'Debug some code', text: 'Why does this Python code print None?\n\n```python\ndef add(a, b):\n    print(a + b)\n\nprint(add(2, 3))\n```' },
  { title: 'Quick fact', text: 'What is the capital of Australia?' },
  { title: 'Write something', text: 'Write a short poem about a city waking up in the rain.' },
  { title: 'Think it through', text: 'Compare SQLite and PostgreSQL for a small side project and recommend one, step by step.' },
]

export function ModelPicker({ models, value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const current = models.find((m) => m.id === value)
  const groups = [...new Set(models.map((m) => m.provider_label))]
  return (
    <div className="picker" ref={ref}>
      <button className="picker-btn" onClick={() => setOpen(!open)} aria-haspopup="listbox">
        <ProviderMark provider={current?.provider} />
        <span>{current?.label || 'Choose a model'}</span>
        <i className="chev">{Icon.chevron}</i>
      </button>
      {open && (
        <div className="picker-menu" role="listbox">
          {groups.map((g) => (
            <div key={g}>
              <div className="picker-group">{g}</div>
              {models.filter((m) => m.provider_label === g).map((m) => (
                <button key={m.id} role="option" aria-selected={m.id === value} disabled={!m.configured}
                  className={`picker-item ${m.id === value ? 'on' : ''}`}
                  onClick={() => { onChange(m.id); setOpen(false) }}>
                  <ProviderMark provider={m.provider} />
                  <span className="grow">{m.label}</span>
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

function Meta({ m }) {
  const bits = [
    fmtMs(m.latency_ms) && `${fmtMs(m.latency_ms)} total`,
    fmtMs(m.first_token_ms) && `first token ${fmtMs(m.first_token_ms)}`,
    m.tokens_in != null && `${m.tokens_in} in / ${m.tokens_out} out tokens`,
  ].filter(Boolean)
  return bits.length ? <div className="meta">{bits.join(' · ')}{m.stopped ? ' · stopped' : ''}</div> : null
}

function Message({ m, models, onRetry }) {
  if (m.role === 'user') {
    return <div className="msg user"><div className="bubble">{m.content}</div></div>
  }
  const tier = models.find((x) => x.id === m.model)?.tier
  return (
    <div className="msg assistant">
      <div className="msg-head">
        <ModelBadge model={m.model} models={models} />
        {tier === 'paid' && <TierTag tier="paid" />}
      </div>
      {m.content ? <Markdown text={m.content} /> : !m.error && <div className="typing"><i /><i /><i /></div>}
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

export default function Chat({ messages, models, model, setModel, onSend, onStop, streaming, header, emptyNote }) {
  const [text, setText] = useState('')
  const end = useRef(null)
  const box = useRef(null)

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [messages])
  useEffect(() => {
    const t = box.current
    if (t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 220) + 'px' }
  }, [text])

  const send = (value = text) => {
    if (!value.trim() || streaming) return
    onSend(value)
    setText('')
  }
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')

  return (
    <section className="chat">
      {header}
      <div className="thread">
        {!messages.length ? (
          <div className="empty">
            <div className="empty-logo">{Icon.chat}</div>
            <h1>What do you want to ask?</h1>
            <p className="muted">Pick a model, or let the router choose one for your question.</p>
            {emptyNote}
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s.title} onClick={() => send(s.text)} disabled={streaming}>
                  <strong>{s.title}</strong>
                  <span>{s.text.split('\n')[0]}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="messages">
            {messages.map((m, i) => (
              m.divider
                ? <div key={i} className="divider"><span>{m.divider}</span></div>
                : <Message key={m.id || i} m={m} models={models}
                  onRetry={m.error && i === messages.length - 1 ? () => onSend(lastUser.content, { retry: true }) : null} />
            ))}
            <div ref={end} />
          </div>
        )}
      </div>
      <div className="composer-wrap">
        <div className="composer">
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
        <div className="hint muted">Enter to send · Shift+Enter for a new line · Replies come straight from each provider's own API</div>
      </div>
    </section>
  )
}
