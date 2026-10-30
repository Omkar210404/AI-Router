import { useEffect, useState } from 'react'
import { api } from './api.js'
import { ProviderMark, TierTag } from './ui.jsx'

function ProviderCard({ p, onTested }) {
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const test = async () => {
    setBusy(true)
    const r = await api.testProvider(p.name).catch((e) => ({ ok: false, detail: e.message }))
    setResult(r)
    setBusy(false)
    onTested()
  }
  const state = result ? (result.ok ? 'ok' : 'bad') : p.configured ? 'ok' : 'off'
  return (
    <div className="card provider">
      <div className="card-head">
        <ProviderMark provider={p.name} size={20} />
        <strong className="grow">{p.label}</strong>
        <TierTag tier={p.tier} />
      </div>
      <div className={`status ${state}`}>
        <i />{state === 'ok' ? (result ? 'Working' : 'Configured') : state === 'bad' ? 'Test failed' : 'Not configured'}
      </div>
      <p className="muted small">{p.note}</p>
      <p className="small">
        {p.key_env ? <>Key: <code>{p.key_env}</code> in <code>.env</code></> : <>Needs the Ollama app running locally</>}
      </p>
      {result && <div className={`test-result ${result.ok ? 'ok' : 'bad'}`}>{result.detail}</div>}
      <button className="btn" onClick={test} disabled={busy}>{busy ? 'Testing…' : 'Test connection'}</button>
    </div>
  )
}

export default function Settings({ models, onChange }) {
  const [providers, setProviders] = useState([])
  const [routing, setRouting] = useState(null)
  const load = () => {
    api.providers().then(setProviders).catch(() => {})
    api.routing().then(setRouting).catch(() => {})
  }
  useEffect(load, [])
  const ready = new Set(models.filter((m) => m.configured).map((m) => m.id))
  const matches = (pattern) => {
    const re = new RegExp('^' + pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$')
    return models.filter((m) => re.test(m.id))
  }

  return (
    <div className="settings">
      <h1>Settings</h1>
      <p className="muted">Each provider is called through its own official API with its own key. Nothing goes through a middleman.</p>

      <h2>Providers</h2>
      <div className="grid">
        {providers.map((p) => <ProviderCard key={p.name} p={p} onTested={() => { load(); onChange() }} />)}
      </div>
      <div className="callout">
        <strong>About cost.</strong> Ollama is free and local. Gemini has a free tier with rate limits.
        OpenAI and Anthropic are paid: every message you send to them is billed to your account.
        The <em>Test connection</em> button only lists models, which costs nothing on any provider.
        Token counts under each reply come straight from the provider; AIRouter doesn't estimate prices.
      </div>

      <h2>Routing rules</h2>
      <p className="muted">
        Auto mode scores your message against these categories and picks the first configured model in the list.
        Edit <code>{routing?.file || 'routing.toml'}</code> to change them; the next message uses your changes.
        These are opinionated defaults, not benchmark results.
      </p>
      <div className="routes">
        {routing && Object.entries(routing.categories).map(([key, c]) => (
          <div className="card route-row" key={key}>
            <div className="route-name">
              <strong>{c.label}</strong>
              <span className="muted small">{(c.keywords || []).length} keywords · {(c.patterns || []).length} patterns</span>
            </div>
            <div className="grow">
              <div className="small">{c.reason}</div>
              <div className="prefer">
                {(c.prefer || []).map((p, i) => {
                  const ms = matches(p)
                  const on = ms.some((m) => ready.has(m.id))
                  return (
                    <span key={p} className={`pref ${on ? 'on' : ''}`} title={on ? 'Configured' : 'Not configured'}>
                      <ProviderMark provider={p.split(':')[0]} size={11} />
                      {i + 1}. {p.includes('*') ? p : (ms[0]?.label || p)}
                    </span>
                  )
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
