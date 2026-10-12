#!/usr/bin/env tsx
// #346 — a phone-width storyboard of each builder journey, from a run's
// manifest: the screenshots in order, one caption each. Pure HTML, images
// beside it, so it opens anywhere and copies straight into socialus-design.
//
//   tsx scripts/builders/storyboard.ts <run-dir>     writes <run-dir>/storyboard.html

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface Shot { kind: string; org: string; n: number; caption: string; file: string }
interface Friction { kind: string; org: string; step: string; what: string; detail: string }

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export interface Strip {
  heading: string
  sub?: string
  /** Already-escaped HTML shown above the strip. */
  notes?: string
  frames: { src: string; caption: string }[]
}

/** One plain HTML page: a strip of phone-width pictures per section, one caption each. */
export function renderStoryboard(title: string, intro: string, strips: Strip[]): string {
  const sections = strips.map((s) => {
    const frames = s.frames
      .map((f) => `<figure><img src="${esc(f.src)}" alt="${esc(f.caption)}" loading="lazy"><figcaption>${esc(f.caption)}</figcaption></figure>`)
      .join('\n')
    const sub = s.sub ? ` <span>${esc(s.sub)}</span>` : ''
    return `<section><h2>${esc(s.heading)}${sub}</h2>${s.notes ?? ''}<div class="strip">${frames}</div></section>`
  })
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
body{font:15px/1.4 system-ui,sans-serif;margin:0;padding:16px;background:#f7f6f2;color:#1a1a1a}
h1{font-size:20px;margin:0 0 16px}h2{font-size:17px;margin:24px 0 8px}h2 span{font-weight:400;color:#6b6b6b;font-size:14px}
.strip{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px}
figure{margin:0;flex:0 0 220px}img{width:220px;border:1px solid #e5e3dd;border-radius:12px;background:#fff}
figcaption{font-size:13px;margin-top:4px}.friction{margin:0 0 8px;padding-left:18px;color:#b42318;font-size:13px}
</style></head><body>
<h1>${esc(title)}</h1>
<p>${esc(intro)}</p>
${sections.join('\n')}
</body></html>
`
}

export function storyboard(shots: Shot[], friction: Friction[], date: string): string {
  const byJourney = new Map<string, Shot[]>()
  for (const s of shots) {
    const key = `${s.kind}|${s.org}`
    byJourney.set(key, [...(byJourney.get(key) ?? []), s])
  }
  const strips = [...byJourney].map(([key, list]): Strip => {
    const [kind, org] = key.split('|') as [string, string]
    const stuck = friction.filter((f) => f.kind === kind && f.org === org)
    return {
      heading: org,
      sub: kind,
      notes: stuck.length ? `<ul class="friction">${stuck.map((f) => `<li><b>${esc(f.step)}</b> — ${esc(f.what)}: ${esc(f.detail)}</li>`).join('')}</ul>` : undefined,
      frames: list.sort((a, b) => a.n - b.n).map((s) => ({ src: s.file, caption: `${s.n}. ${s.caption}` })),
    }
  })
  return renderStoryboard(
    `Builder journeys, ${date}`,
    'Sign in → Create → draft Page → fill in → Before you publish → live Page → post an event. Red notes are where a run got stuck.',
    strips,
  )
}

if (process.argv[1]?.endsWith('storyboard.ts')) {
  const dir = process.argv[2]
  if (!dir) throw new Error('usage: storyboard.ts <run-dir>')
  const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as { shots: Shot[]; friction: Friction[] }
  writeFileSync(join(dir, 'storyboard.html'), storyboard(m.shots, m.friction, dir.split('/').pop() ?? ''))
  console.log(`storyboard: ${m.shots.length} frames`)
}
