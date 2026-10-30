import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

// Brand-neutral provider marks: a shape + colour per provider, no logos.
const MARKS = {
  gemini: { color: 'var(--c-violet)', path: 'M12 3l9 9-9 9-9-9z' },
  groq: { color: 'var(--c-rose)', path: 'M5.5 5.5h13v13h-13z' },
  ollama: { color: 'var(--c-teal)', path: 'M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z' },
  openai: { color: 'var(--c-green)', path: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z' },
  anthropic: { color: 'var(--c-amber)', path: 'M12 3.5l9 16H3z' },
  auto: { color: 'var(--accent)', path: 'M5 4v5a5 5 0 0 0 5 5h9M15 10l4 4-4 4' },
}

export function ProviderMark({ provider, size = 16 }) {
  const m = MARKS[provider] || MARKS.auto
  const stroke = provider === 'auto'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="mark">
      <path d={m.path} fill={stroke ? 'none' : m.color} stroke={stroke ? m.color : 'none'}
        strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ModelBadge({ model, models }) {
  const provider = model?.split(':')[0]
  const info = models.find((m) => m.id === model)
  return (
    <span className="badge">
      <ProviderMark provider={provider} size={13} />
      {info?.label || model?.split(':').slice(1).join(':') || 'unknown'}
    </span>
  )
}

export function TierTag({ tier }) {
  const text = { free: 'free tier', local: 'local', paid: 'paid' }[tier] || tier
  return <span className={`tier tier-${tier}`}>{text}</span>
}

function CodeBlock({ children, ...props }) {
  const [copied, setCopied] = useState(false)
  const code = children?.props?.children
  const lang = /language-(\w+)/.exec(children?.props?.className || '')?.[1]
  const copy = () => {
    navigator.clipboard?.writeText(String(extractText(code)))
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  return (
    <div className="code">
      <div className="code-head">
        <span>{lang || 'code'}</span>
        <button onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <pre {...props}>{children}</pre>
    </div>
  )
}

function extractText(node) {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return node
  if (Array.isArray(node)) return node.map(extractText).join('')
  return extractText(node.props?.children)
}

// Models write math as \( \) / \[ \] or $ / $$. remark-math only knows the dollar form.
const mathDelims = (t) => t
  .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `$$${m}$$`)
  .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m}$`)

export function Markdown({ text }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, [rehypeHighlight, { ignoreMissing: true }]]}
        components={{ pre: CodeBlock, a: (p) => <a {...p} target="_blank" rel="noreferrer" /> }}>
        {mathDelims(text)}
      </ReactMarkdown>
    </div>
  )
}

export const Icon = {
  plus: <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>,
  send: <svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7" /></svg>,
  stop: <svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" /></svg>,
  trash: <svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3" /></svg>,
  gear: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>,
  sun: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>,
  moon: <svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>,
  menu: <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
  chevron: <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>,
  chat: <svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>,
}

export function timeAgo(ts) {
  const s = Date.now() / 1000 - ts
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function fmtMs(ms) {
  if (ms == null) return null
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}
