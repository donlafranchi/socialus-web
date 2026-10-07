// F100 criterion 9 — runs the current prompt and models against the labelled
// set in evals/moderation/cases.json and prints recall, false-alarm rate,
// severity accuracy, latency and cost per case. Needs ANTHROPIC_API_KEY.
// Run on every prompt change: `npm run moderation:eval`.
// Cases are text-only for now; photo cases come from licensed stock only, with
// the licence recorded per photo (criterion 10).

import { readFileSync } from 'node:fs'
import { assessContent, HAIKU } from '../src/lib/moderation/assess'
import { summarise, type Scored } from '../src/lib/moderation/eval-metrics'

// Estimated list prices, USD per million tokens (input, output). Check before quoting.
const PRICE: Record<string, [number, number]> = { [HAIKU]: [1, 5], 'claude-sonnet-5-5': [3, 15] }

interface Case {
  id: string
  text: string
  reporterReason: string
  label: { outcome: 'approve' | 'remove'; severity: number }
}

async function main() {
  const cases: Case[] = JSON.parse(readFileSync('evals/moderation/cases.json', 'utf8'))
  const scored: Scored[] = []
  for (const c of cases) {
    const r = await assessContent({ text: c.text, image: null, reporterReason: c.reporterReason, rebuttal: null })
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
    console.log(`${c.id}: want ${c.label.outcome}/${c.label.severity}, got ${r ? `${r.shown.outcome}/${r.shown.severity} @${r.shown.confidence}` : 'nothing'}`)
  }
  console.table(summarise(scored))
}

main()
