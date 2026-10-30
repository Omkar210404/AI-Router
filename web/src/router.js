// Browser copy of airouter/router.py, used only by the static GitHub Pages demo
// (there is no Python server there). Same rules, same routing.toml data.

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const glob = (p) => new RegExp('^' + p.split('*').map(esc).join('.*') + '$')

export function classify(text, categories) {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  const lowered = text.toLowerCase()
  const scores = {}
  const signals = {}
  for (const [name, cat] of Object.entries(categories)) {
    let score = 0
    const hits = []
    for (const kw of cat.keywords || []) {
      if (new RegExp(`(?<!\\w)${esc(kw.toLowerCase())}(?!\\w)`).test(lowered)) {
        score += cat.keyword_weight ?? 1
        hits.push(kw)
      }
    }
    for (const pat of cat.patterns || []) {
      if (new RegExp(pat, 'im').test(text)) {
        score += cat.pattern_weight ?? 2
        hits.push(`pattern ${pat}`)
      }
    }
    if (cat.short_words != null && words <= cat.short_words) {
      score += cat.short_bonus ?? 1
      hits.push(`short (${words} words)`)
    }
    if (cat.long_words != null && words >= cat.long_words) {
      score += cat.long_bonus ?? 1
      hits.push(`long (${words} words)`)
    }
    // A length bonus alone is too weak a signal.
    scores[name] = hits.some((h) => !h.startsWith('short') && !h.startsWith('long')) ? score : 0
    signals[name] = hits
  }
  let best = Object.keys(scores).reduce((a, b) => (scores[b] > scores[a] ? b : a))
  if (scores[best] === 0) best = 'general'
  return { category: best, scores, signals: signals[best] || [] }
}

function pickModel(prefer, models) {
  const skipped = []
  for (const p of prefer) {
    const re = glob(p)
    const matches = models.filter((m) => re.test(m.id))
    const ready = matches.find((m) => m.configured)
    if (ready) return [ready, skipped]
    if (matches.length) skipped.push(...matches.map((m) => m.id))
    else if (!p.includes('*')) skipped.push(p)
  }
  return [null, skipped]
}

export function route(text, models, categories) {
  const c = classify(text, categories)
  const cat = categories[c.category]
  let [model, skipped] = pickModel(cat.prefer || [], models)
  let note = ''
  if (!model) {
    model = models.find((m) => m.configured) || null
    if (model) note = `None of the preferred models for this are set up, so using ${model.label}.`
  } else if (skipped.length) {
    const first = models.find((m) => m.id === skipped[0])?.label || skipped[0].split(':').slice(1).join(':')
    note = `${first} would be first choice but isn't configured.`
  }
  return {
    category: c.category, label: cat.label || c.category, reason: cat.reason || '', note,
    signals: c.signals.slice(0, 6), scores: c.scores,
    model: model?.id || null, model_label: model?.label || null,
  }
}
