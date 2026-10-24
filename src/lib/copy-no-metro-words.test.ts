import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

// #848 / #1015 / F103.4 — no member-facing string says metro, MSA or CSA, and nothing member-facing reads the MSA.
// Reads the prose in .tsx files under src (string literals with a space, and JSX text) and the string literals in
// .ts files; operator screens, dev pages, the action handlers' internal errors and tests are out.
const SRC = join(__dirname, '..')
const WORD = /\b(metros?|msa|csa)\b/i
// The one word that stays: "CSA" the farm box is a different thing from the Census area.
const KNOWN: Record<string, string[]> = {
  'components/RecruitmentGrid.tsx': ['CSA'],
}
// A handler's own error text ("metro.waitlist_join: ...") and an operator's log line are not member-facing.
const INTERNAL = /^[\w.[\]-]+:\s/

function files(dir: string, ext: '.tsx' | '.ts'): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return /^(\(dev\)|admin|ontology|actions|node_modules)$/.test(e.name) ? [] : files(p, ext)
    const isThis = e.name.endsWith(ext) && !(ext === '.ts' && e.name.endsWith('.tsx'))
    return isThis && !/\.test\./.test(e.name) ? [p] : []
  })
}

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/\s.*$/gm, '')

export function proseWithMetro(source: string, jsxText = true): string[] {
  const out: string[] = []
  const re = jsxText ? /(["'`])((?:(?!\1)[^\n])*?)\1|>([^<>{}]+)</g : /(["'`])((?:(?!\1)[^\n])*?)\1/g
  for (const m of stripComments(source).matchAll(re)) {
    const t = (m[2] ?? m[3] ?? '').trim()
    if (/console\.\w+\($/.test(m.input!.slice(0, m.index).split('\n').pop() ?? '')) continue
    if (t.includes(' ') && !INTERNAL.test(t) && WORD.test(t)) out.push(t)
  }
  return out
}

/** Reads of the Census area code in app code. Migrations, reports and tests are outside src/ or tests. */
export function msaReads(source: string): boolean {
  return /\bmsa_code\b|[?&]msa=/.test(stripComments(source))
}

function scan(ext: '.tsx' | '.ts', jsxText: boolean): string[] {
  const found: string[] = []
  for (const f of files(SRC, ext)) {
    const rel = relative(SRC, f)
    for (const t of proseWithMetro(readFileSync(f, 'utf8'), jsxText)) {
      if (!(KNOWN[rel] ?? []).some((k) => t.includes(k))) found.push(`${rel}: ${t.slice(0, 60)}`)
    }
  }
  return found
}

describe('no member-facing string says metro, MSA or CSA (#848, #1015)', () => {
  it('the scanner sees a label, a JSX text, an aria-label and a plain string in a .ts file', () => {
    expect(proseWithMetro('<select aria-label="Default metro" />')).toEqual(['Default metro'])
    expect(proseWithMetro('<p>Your metro is open</p>')).toEqual(['Your metro is open'])
    expect(proseWithMetro("const k = 'metro_id'; // the metro here")).toEqual([])
    expect(proseWithMetro("return 'Across the metro'", false)).toEqual(['Across the metro'])
    expect(proseWithMetro("throw new Error('metro.waitlist_join: not found')", false)).toEqual([])
  })

  it('the scanner sees an MSA read', () => {
    expect(msaReads("where p.msa_code = $1")).toBe(true)
    expect(msaReads("fetch('/api/boundaries?msa=40900')")).toBe(true)
    expect(msaReads("// msa_code is a report-only column")).toBe(false)
  })

  // [guards F103.4]
  it('no surface shows metro, MSA or CSA, and Explore, boundaries and neighbourhood search read no MSA', () => {
    expect(scan('.tsx', true)).toEqual([])
    expect(scan('.ts', false)).toEqual([])
    const reading = [...files(SRC, '.ts'), ...files(SRC, '.tsx')].filter((f) => msaReads(readFileSync(f, 'utf8')))
    expect(reading.map((f) => relative(SRC, f))).toEqual([])
  })

  it('the You page has no Metro row', () => {
    expect(readFileSync(join(SRC, 'app/you/page.tsx'), 'utf8')).not.toMatch(/DefaultMetro|label="Metro"/)
  })
})
