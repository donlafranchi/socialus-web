// #904 — the monthly review's body: the numbers, what looks off, and everything that can change (cap, gap, quiet
// default, the weekly time, every string), so whoever proposes the next change has it on one page.

import { NOTIFY_COPY } from './copy'
import { DAILY_CAP, DEFAULT_PREFS, MIN_GAP_MS, STALE_MS } from './rules'
import type { KindSummary } from './review'

const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`)
const NAME: Record<string, string> = { follow_posts: 'New posts from Pages I follow', weekend: 'This weekend near me' }

export function reviewMarkdown(r: { at: string; state: string; kinds: KindSummary[] }): string {
  const lines = [
    `## Notifications review, ${r.at.slice(0, 10)}`,
    '',
    `**State: ${r.state}.** Counts only, no member is named. Ruling: socialus-plan product/foundation/verbs.md § Rulings (2026-10-18, [for now], monthly and at each release).`,
    '',
    '| Kind | State | Opted in | Opened | Last 4 weeks: sends · opens · turned off · paused |',
    '|---|---|---|---|---|',
  ]
  for (const k of r.kinds) {
    const four = k.weeks.slice(-4)
    const sum = (f: 'sends' | 'opens' | 'unsubscribes' | 'mutes') => four.reduce((s, w) => s + w[f], 0)
    lines.push(`| ${NAME[k.kind]} | ${k.state}${k.why ? ` (${k.why})` : ''} | ${pct(k.optInRate)} | ${pct(k.openRate)} | ${sum('sends')} · ${sum('opens')} · ${sum('unsubscribes')} · ${sum('mutes')} |`)
  }
  lines.push(
    '',
    '### What can change',
    '',
    `- Follow posts: at most ${DAILY_CAP} a day, ${MIN_GAP_MS / 60000} minutes apart, batched; a post waiting more than ${STALE_MS / 3600000} hours is dropped.`,
    `- Quiet hours default ${DEFAULT_PREFS.quietStart}:00 to ${DEFAULT_PREFS.quietEnd}:00 Pacific.`,
    '- This weekend: Thursday from 5 pm Pacific, hourly to 9 pm for members in quiet hours; nothing is sent when nothing is on.',
    '',
    '### Every string',
    '',
    ...Object.entries(NOTIFY_COPY).map(([k, v]) => `- \`${k}\`: ${typeof v === 'function' ? sample(k, v as (...a: never[]) => string) : v}`),
    '',
    '### Propose',
    '',
    'One PR with the changes (frequency, triggers, copy), labelled `human-review`, and one P2 to-do for Don. A red kind comes first.',
    '',
  )
  return lines.join('\n')
}

function sample(key: string, fn: (...a: never[]) => string): string {
  const call = fn as unknown as (...a: unknown[]) => string
  if (key === 'followOneTitle') return `(the Page's name, e.g. "${call('Midtown Bakery')}")`
  if (key === 'followManyTitle') return call(3)
  if (key === 'followManyBody') return call(['A', 'B', 'C', 'D'])
  if (key === 'weekendBody') return call(5, 2)
  return call()
}
