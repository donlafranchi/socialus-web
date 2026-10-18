import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

// #848 / F103.4 — no member-facing string says metro, MSA or CSA. Reads the prose in .tsx files under src
// (string literals with a space, and JSX text); operator screens, dev pages and tests are out.
const SRC = join(__dirname, '..')
const WORD = /\b(metros?|msa|csa)\b/i
// Known leftovers, each a different job: "CSA" the farm box; the rest wait on F105's place control and a copy ruling (Don).
const KNOWN: Record<string, string[]> = {
  'components/RecruitmentGrid.tsx': ['CSA'],
  'components/metro/MetroWaitlistStep.tsx': ['Pick your metro'],
  'components/explore/MetroNotCoveredPanel.tsx': ['this metro opens'],
  'components/explore/AreaPicker.tsx': ['this metro'],
}

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return /^(\(dev\)|admin|ontology|node_modules)$/.test(e.name) ? [] : files(p)
    return e.name.endsWith('.tsx') && !/\.test\./.test(e.name) ? [p] : []
  })
}

export function proseWithMetro(source: string): string[] {
  const s = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/\s.*$/gm, '')
  const out: string[] = []
  for (const m of s.matchAll(/(["'`])((?:(?!\1)[^\n])*?)\1|>([^<>{}]+)</g)) {
    const t = (m[2] ?? m[3] ?? '').trim()
    if (t.includes(' ') && WORD.test(t)) out.push(t)
  }
  return out
}

describe('no member-facing string says metro, MSA or CSA (#848)', () => {
  it('the scanner sees a label, a JSX text and an aria-label', () => {
    expect(proseWithMetro('<select aria-label="Default metro" />')).toEqual(['Default metro'])
    expect(proseWithMetro('<p>Your metro is open</p>')).toEqual(['Your metro is open'])
    expect(proseWithMetro("const k = 'metro_id'; // the metro here")).toEqual([])
  })
  it('finds none outside the known leftovers', () => {
    const found: string[] = []
    for (const f of files(SRC)) {
      const rel = relative(SRC, f)
      for (const t of proseWithMetro(readFileSync(f, 'utf8'))) {
        if (!(KNOWN[rel] ?? []).some((k) => t.includes(k))) found.push(`${rel}: ${t.slice(0, 60)}`)
      }
    }
    expect(found).toEqual([])
  })
  it('the You page has no Metro row', () => {
    expect(readFileSync(join(SRC, 'app/you/page.tsx'), 'utf8')).not.toMatch(/DefaultMetro|label="Metro"/)
  })
})
