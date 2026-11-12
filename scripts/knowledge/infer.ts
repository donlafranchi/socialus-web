// F125 / T1017 (#1218) — which principle a ruling applies.
//
// Stated, where the ruling cites a principle by its anchor (`#you-choose`).
// Otherwise inferred, and marked so (F125.10): the principle whose words the
// ruling shares most, weighted by how rare each word is (tf-idf, cosine), when
// the overlap clears a floor. Words, not a model: the store runs no model and
// names none, every guess is reproducible from the two texts, and the reason
// on the link lists the words it rested on, so a wrong guess is visible and
// cheap to fix (the brief § The import).

export interface Text {
  id: string
  text: string
}

export interface Applies {
  from: string
  to: string
  basis: 'stated' | 'inferred'
  reason: string
}

/** How much two texts must share before a guess is made. Tuned on the 2026-11-10 rulings. */
export const FLOOR = 0.12

const STOP = new Set(
  (
    'the and for that this with from are was were but not any its into than then they them their there these those ' +
    'what when where which who whom why how all each every one two can may must should would could will has have had ' +
    'does did doing done our ours out over under more most less only own same also just like such very about after ' +
    'before because been being both between during here him his her hers she you your yours page pages member members ' +
    'socialus ruling rulings don the pm agent agents decision decisions scenario scenarios issue plan web via '
  ).split(/\s+/),
)

function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? [])
    .map((w) => w.replace(/'s$/, '').replace(/s$/, ''))
    .filter((w) => w.length > 2 && !STOP.has(w))
}

function vectors(texts: Text[]): Map<string, Map<string, number>> {
  const docs = texts.map((t) => ({ id: t.id, ws: words(t.text) }))
  const df = new Map<string, number>()
  for (const d of docs) for (const w of new Set(d.ws)) df.set(w, (df.get(w) ?? 0) + 1)
  const n = docs.length
  const out = new Map<string, Map<string, number>>()
  for (const d of docs) {
    const tf = new Map<string, number>()
    for (const w of d.ws) tf.set(w, (tf.get(w) ?? 0) + 1)
    const v = new Map<string, number>()
    let norm = 0
    for (const [w, c] of tf) {
      const x = c * Math.log(1 + n / (df.get(w) ?? 1))
      v.set(w, x)
      norm += x * x
    }
    norm = Math.sqrt(norm) || 1
    for (const [w, x] of v) v.set(w, x / norm)
    out.set(d.id, v)
  }
  return out
}

/**
 * For every ruling, the principles it applies: each one it cites by anchor,
 * or else the single closest one by shared words, if close enough.
 */
export function inferApplies(
  rulings: Text[],
  principles: (Text & { anchor: string | null })[],
): Applies[] {
  const vs = vectors([...rulings, ...principles])
  const out: Applies[] = []
  for (const r of rulings) {
    const cited = principles.filter((p) => p.anchor && new RegExp(`#${p.anchor}(?![a-z0-9-])`).test(r.text))
    if (cited.length) {
      for (const p of cited) out.push({ from: r.id, to: p.id, basis: 'stated', reason: `Cites #${p.anchor}.` })
      continue
    }
    const rv = vs.get(r.id)!
    let best: { p: Text; score: number; shared: [string, number][] } | null = null
    for (const p of principles) {
      if (p.id === r.id) continue
      const pv = vs.get(p.id)!
      let score = 0
      const shared: [string, number][] = []
      for (const [w, x] of rv) {
        const y = pv.get(w)
        if (y) {
          score += x * y
          shared.push([w, x * y])
        }
      }
      if (!best || score > best.score) best = { p, score, shared }
    }
    // One shared word is a coincidence ("map"), not a reason.
    if (best && best.score >= FLOOR && best.shared.length >= 2) {
      const top = best.shared
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([w]) => w)
      out.push({
        from: r.id,
        to: best.p.id,
        basis: 'inferred',
        reason: `Inferred at import from shared words (${top.join(', ')}); score ${best.score.toFixed(2)}.`,
      })
    }
  }
  return out
}
