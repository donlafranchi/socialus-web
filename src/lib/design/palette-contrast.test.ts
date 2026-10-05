import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// #325 — the Anodised pairings the palette allows, measured from globals.css
// itself so a changed value fails here rather than on a member's screen.
const css = readFileSync('src/app/globals.css', 'utf8')

function token(name: string, seen = new Set<string>()): string {
  if (seen.has(name)) throw new Error(`cycle at ${name}`)
  const m = css.match(new RegExp(`--color-${name}:\\s*([^;]+);`))
  if (!m) throw new Error(`--color-${name} is not defined`)
  const v = m[1]!.trim()
  const ref = v.match(/^var\(--color-([a-z0-9-]+)\)$/)
  return ref ? token(ref[1]!, seen.add(name)) : v
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!)
}

const ratio = (a: string, b: string) => {
  const [x, y] = [luminance(token(a)), luminance(token(b))]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

// WCAG 2.1 AA: 4.5 for text, 3 for non-text marks and focus rings.
const PAIRS: [fg: string, bg: string, min: number][] = [
  ['accent', 'bg', 4.5],
  ['accent', 'surface', 4.5],
  ['accent-text', 'bg', 4.5],
  ['accent-hover', 'bg', 4.5],
  ['bg', 'accent', 4.5],
  ['bg', 'accent-hover', 4.5],
  ['accent', 'accent-tint', 4.5],
  ['focus', 'bg', 3],
  ['highlight-text', 'bg', 4.5],
  ['highlight-text', 'surface', 4.5],
  ['highlight-text', 'highlight-tint', 4.5],
  ['highlight-mark', 'bg', 3],
  ['highlight-mark', 'surface', 3],
  ['highlight-soft', 'frame', 4.5],
  ['highlight', 'frame', 3],
  ['highlight', 'accent', 3],
  ['on-frame', 'frame', 4.5],
  ['on-frame-muted', 'frame', 4.5],
  ['focus-on-frame', 'frame', 3],
  ['danger', 'bg', 4.5],
  ['danger', 'danger-tint', 4.5],
  ['success', 'bg', 4.5],
  ['warning', 'bg', 4.5],
  ['warning', 'warning-tint', 4.5],
]

describe('#325 — Anodised colour pairings meet WCAG AA', () => {
  it.each(PAIRS)('%s on %s is at least %s:1', (fg, bg, min) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(min)
  })

  it('the bright golds stay off white: they fail as text there, which is why the rule exists', () => {
    expect(ratio('highlight', 'bg')).toBeLessThan(3)
  })
})
