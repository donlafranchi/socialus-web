// F100 criterion 9 — runs a labelled set through the same call the app makes and
// summarises it. The script (`npm run moderation:eval`) is a thin shell around this.

import { assessContent, HAIKU, type AssessInput } from './assess'
import { summarise, type Scored } from './eval-metrics'
import type { EvalCase } from './eval-cases'

// Estimated list prices, USD per million tokens (input, output). Check before quoting.
const PRICE: Record<string, [number, number]> = { [HAIKU]: [1, 5], 'claude-sonnet-5-5': [3, 15] }

interface Deps {
  fetch?: typeof fetch
  env?: Record<string, string | undefined>
  readImage: (file: string) => AssessInput['image']
}

export async function runSet(cases: EvalCase[], { fetch, env, readImage }: Deps) {
  const scored: Scored[] = []
  const rows: { id: string; want: string; got: string }[] = []
  for (const c of cases) {
    const image = c.image ? readImage(c.image) : null
    const r = await assessContent({ text: c.text, image, reporterReason: c.reporterReason, rebuttal: null }, { fetch, env })
    const cost = (r?.reads ?? []).reduce((a, x) => {
      const [i, o] = PRICE[x.model] ?? [0, 0]
      return a + (x.inputTokens * i + x.outputTokens * o) / 1e6
    }, 0)
    scored.push({
      label: c.label,
      got: r ? { outcome: r.shown.outcome, severity: r.shown.severity } : null,
      latencyMs: (r?.reads ?? []).reduce((a, x) => a + x.latencyMs, 0),
      costUsd: cost,
    })
    rows.push({
      id: c.id,
      want: `${c.label.outcome}/${c.label.severity}`,
      got: r ? `${r.shown.outcome}/${r.shown.severity} @${r.shown.confidence}` : 'nothing',
    })
  }
  return { summary: summarise(scored), rows }
}
