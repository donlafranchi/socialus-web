// #951 — Don, 2026-10-18 [always]: no chip or pill UI anywhere; typography,
// spacing and quiet text links instead. This scans the UI source so a new chip
// fails CI instead of shipping. Round icon buttons, avatars, dots, switches,
// toasts and real full-width or button-sized actions are not chips.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..')
const DIRS = ['src/components', 'src/app']

// path → why a match there is not a chip. Keep this short.
const ALLOW: Record<string, string> = {}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return files(p)
    return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : []
  })
}

const NAME = /\b[A-Z]\w*(?:Chip|Pill)s?\b/
const CLASS = /(?:^|\s)\.?chip(?:-selected)?(?=\s|$|\{|:)/
const STRING = /(["'`])((?:(?!\1).)*)\1/g

/** A rounded-full class string with a fill or border and small padding is a chip. */
export function isChipClass(cls: string): boolean {
  const t = cls.split(/\s+/)
  if (!t.includes('rounded-full')) return false
  const base = t.filter((x) => !x.includes(':'))
  const filled = base.some((x) => /^(bg-|border$|border-(?!0|none))/.test(x) && x !== 'bg-transparent')
  const small = base.some((x) => /^px-(0\.5|1|1\.5|2|2\.5|3|3\.5)$/.test(x))
  const text = base.some((x) => /^text-(xs|sm|micro|caption|\[\d+px\])$/.test(x))
  const iconOrFull = base.some((x) => /^(w-full|fixed|size-|h-\d+$|w-\d+$)/.test(x))
  return filled && small && text && !iconOrFull
}

export function chipFindings(path: string, src: string): string[] {
  const out: string[] = []
  src.split('\n').forEach((line, i) => {
    const at = `${path}:${i + 1}`
    if (path.endsWith('.css')) {
      if (/^\s*\.chip(?:-selected)?\b/.test(line)) out.push(`${at} .chip class`)
      return
    }
    if (/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line)) return
    if (NAME.test(line)) out.push(`${at} Chip/Pill component name`)
    for (const m of line.matchAll(STRING)) if (CLASS.test(m[2])) out.push(`${at} chip class`)
    // The whole line, so a class string split by a template `${…}` still counts.
    const cls = line.replace(/[`'"{}$?=<>()]/g, ' ')
    if (isChipClass(cls)) out.push(`${at} rounded-full chip: ${line.trim()}`)
  })
  return out
}

describe('no chip or pill UI (#951, Don 2026-10-18 [always])', () => {
  it('finds no chip pattern in src/components or src/app', () => {
    const found = DIRS.flatMap((d) => files(join(ROOT, d)))
      .map((p) => relative(ROOT, p))
      .filter((p) => !ALLOW[p])
      .flatMap((p) => chipFindings(p, readFileSync(join(ROOT, p), 'utf8')))
    expect(found).toEqual([])
  })

  it('flags each chip shape and leaves icons, avatars and real buttons alone', () => {
    expect(isChipClass('inline-flex rounded-full border px-3 py-1 text-sm')).toBe(true)
    expect(isChipClass('rounded-full bg-neutral-100 px-2 py-0.5 text-xs')).toBe(true)
    expect(isChipClass('inline-flex h-11 w-11 items-center rounded-full hover:bg-neutral-100')).toBe(false)
    expect(isChipClass('h-8 w-8 rounded-full object-cover')).toBe(false)
    expect(isChipClass('w-full rounded-full bg-[var(--color-accent)] px-4 py-2.5 text-sm')).toBe(false)
    expect(isChipClass('inline-flex min-h-11 items-center rounded-full px-3 text-sm hover:bg-neutral-100')).toBe(false)
    expect(chipFindings('x.tsx', 'export function MarketPill() {}')).toHaveLength(1)
    expect(chipFindings('x.tsx', '<span className="chip text-xs">')).toHaveLength(1)
    expect(chipFindings('x.css', '.chip {')).toHaveLength(1)
    expect(chipFindings('x.tsx', 'import { PillarSelector } from "./PillarSelector"')).toHaveLength(0)
  })
})
