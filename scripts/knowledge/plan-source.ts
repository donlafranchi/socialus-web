// F125 / T1017 (#1218) — reads what the knowledge store imports, from the
// files where it lives today: socialus-plan's dated rulings and PRINCIPLES.md,
// the two absolutes files (socialus-plan product/ABSOLUTES.md and socialus-ops
// process/ABSOLUTES.md), and this repo's src/ontology/registry.json.
//
// Pure: files in, plain records out. Nothing here touches a database; the
// import (import.ts) writes what this returns through the store's functions.
//
// WHICH LINES ARE RULINGS is socialus-plan's scripts/markers.py, read line for
// line: its `decisions()` is what builds constraints/code.md, and the store's
// export has to rebuild that file exactly (F125.1). So the rules below are
// markers.py's, not a second opinion: a ruling is a line matching DECISION in
// PRINCIPLES.md or under `## Rulings` in a scenario or product doc; its binds
// tag is the first one that parses after code spans are blanked; how long it
// holds is the first `[always]`/`[for now]` on the line, and always for
// PRINCIPLES.md. When markers.py changes, this changes with it, and the test
// that compares the two exports goes red until it does.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

export type Holds = 'always' | 'for now'

/** One dated ruling line, as markers.py's decisions() reads it. */
export interface Ruling {
  /** Path inside socialus-plan, e.g. `planning/scenario-F125.md`. */
  file: string
  line: number
  date: string
  /** The bold words, as written (markers.py strips a trailing full stop when it prints them). */
  words: string
  /** Everything else the ruling says: the rest of its line and its indented lines, with the binds tag lifted out. */
  rest: string
  /** null: no binds tag that parses. Otherwise the tiers ([] for tiers=none), the surfaces, and build=none. */
  binds: { tiers: string[]; surfaces: string[]; buildNone: boolean } | null
  holds: Holds | null
  /** `[replaces …]` tags, as text. */
  replaces: string[]
  /** PRINCIPLES.md only: the line's anchor (`<a id="decent">`), which other rulings cite as `#decent`. */
  anchor: string | null
  /** True for a PRINCIPLES.md line. */
  principle: boolean
  /** Whether markers.py lists it: a dated line whose bold starts the line. An anchored principle does not. */
  listed: boolean
}

export interface Absolute {
  /** `socialus-plan/product/ABSOLUTES.md` or `socialus-ops/process/ABSOLUTES.md`. */
  file: string
  slug: string
  /** The rule, its first paragraph, as written. */
  words: string
  /** Every paragraph after the first, as written. */
  rest: string
  scope: 'product' | 'process'
}

const DECISION = /^- \*\*(\d{4}-\d{2}-\d{2}) — (.+?)\*\*/
// PRINCIPLES.md's soul, defaults and pitch lines open with an anchor before
// the bold. markers.py's DECISION does not match them, so they are not in
// constraints/code.md; they are still principles, and come in as philosophies.
const ANCHORED = /^- <a id="([a-z0-9-]+)"><\/a>\*\*(\d{4}-\d{2}-\d{2}) — (.+?)\*\*/
const LASTS = /\[(always|for now)\]/
const ANY_BINDS = /\[binds?(?=[\s\]])/gi
const LIST = '[a-z0-9-]+(?:,[a-z0-9-]+)*'
const FULL_BINDS = new RegExp(`\\[binds tiers=(${LIST})(?: surfaces=(${LIST}))?(?: (build=none))?\\]`, 'y')
const TIERS = ['planning', 'code']
const REPLACES = /\[replaces [^\]]*\]/g
export const PRINCIPLES = 'PRINCIPLES.md'

const LINE_BREAK = new RegExp('\\r\\n|[\\n\\r\\x0b\\x0c\\x1c\\x1d\\x1e\\x85\\u2028\\u2029]')

/** Python's str.splitlines(): every line break it knows, no trailing empty line. */
export function splitLines(text: string): string[] {
  const lines = text.split(LINE_BREAK)
  if (lines.length && lines[lines.length - 1] === '') lines.pop()
  return lines
}

function readLines(path: string): string[] {
  try {
    return splitLines(readFileSync(path, 'utf8'))
  } catch {
    return []
  }
}

function blankCodeSpans(line: string): string {
  return line.replace(/`[^`]*`/g, (c) => ' '.repeat(c.length))
}

/** The first binds tag on the line that parses, as markers.py's parse_line reads it. */
export function parseBinds(line: string): { tiers: string[]; surfaces: string[]; buildNone: boolean } | null {
  const bare = blankCodeSpans(line)
  for (const m of bare.matchAll(ANY_BINDS)) {
    FULL_BINDS.lastIndex = m.index!
    const f = FULL_BINDS.exec(bare)
    if (!f) continue
    const tiers = f[1].split(',')
    const surfaces = f[2] ? f[2].split(',') : []
    if (tiers.length === 1 && tiers[0] === 'none') return { tiers: [], surfaces, buildNone: !!f[3] }
    if (tiers.some((t) => !TIERS.includes(t))) continue
    if (!surfaces.length) continue
    return { tiers, surfaces, buildNone: !!f[3] }
  }
  return null
}

/** (line number, line) for every ruling line: all of PRINCIPLES.md, or `## Rulings` in a scenario or product doc. */
function rulingLines(root: string, file: string): [number, string][] {
  const lines = readLines(join(root, file))
  if (file === PRINCIPLES) return lines.map((l, i) => [i + 1, l])
  const out: [number, string][] = []
  let inside = false
  lines.forEach((l, i) => {
    if (l.startsWith('## ')) inside = l.trim() === '## Rulings'
    else if (inside) out.push([i + 1, l])
  })
  return out
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    if (name.startsWith('.')) return []
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

/** markers.py's rule_files(): PRINCIPLES.md, then the scenarios, then product/, each sorted by code point. */
export function ruleFiles(root: string): string[] {
  const rel = (p: string) => relative(root, p).split(sep).join('/')
  const byCodePoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  const scenarios = walk(join(root, 'planning'))
    .map(rel)
    .filter((p) => /^planning\/scenario-F[^/]*\.md$/.test(p))
    .sort(byCodePoint)
  const product = walk(join(root, 'product'))
    .map(rel)
    .filter((p) => p.endsWith('.md'))
    .sort(byCodePoint)
  return [...(existsSync(join(root, PRINCIPLES)) ? [PRINCIPLES] : []), ...scenarios, ...product]
}

// Built from pieces, as markers.py does, so this file never holds a tag of its own
// (scripts/check-markers.sh fails one outside socialus-plan's rulings).
const BINDS_TAG = new RegExp('\\[' + 'binds [^\\]]*\\]', 'g')

function liftTags(text: string): string {
  return text
    .replace(BINDS_TAG, '')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

/** Every dated ruling in socialus-plan, in markers.py's order: file by file, line by line. */
export function readRulings(root: string): Ruling[] {
  const out: Ruling[] = []
  for (const file of ruleFiles(root)) {
    const lines = rulingLines(root, file)
    lines.forEach(([n, l], i) => {
      const listedMatch = DECISION.exec(l)
      const anchored = file === PRINCIPLES ? ANCHORED.exec(l) : null
      if (!listedMatch && !anchored) return
      const date = listedMatch ? listedMatch[1] : anchored![2]
      const words = (listedMatch ? listedMatch[2] : anchored![3]).trim()
      const head = listedMatch ? listedMatch[0] : anchored![0]
      // Its indented lines belong to it, up to the next line that is not one.
      const more: string[] = []
      for (let j = i + 1; j < lines.length && lines[j][1].startsWith('  '); j++) more.push(lines[j][1].trim())
      const rest = [liftTags(l.slice(head.length)), ...more].filter(Boolean).join('\n')
      const lasts = file === PRINCIPLES ? 'always' : ((LASTS.exec(l)?.[1] as Holds | undefined) ?? null)
      out.push({
        file,
        line: n,
        date,
        words,
        rest,
        binds: parseBinds(l),
        holds: lasts,
        replaces: [...blankCodeSpans(l).matchAll(REPLACES)].map((m) => l.slice(m.index!, m.index! + m[0].length)),
        anchor: anchored ? anchored[1] : null,
        principle: file === PRINCIPLES,
        listed: !!listedMatch,
      })
    })
  }
  return out
}

/** The `### slug` sections of an absolutes file: the slug, the rule, and what follows it. */
export function readAbsolutes(path: string, file: string, scope: 'product' | 'process'): Absolute[] {
  const out: Absolute[] = []
  let current: { slug: string; paras: string[][] } | null = null
  const close = () => {
    if (!current) return
    const paras = current.paras.map((p) => p.join(' ').trim()).filter(Boolean)
    if (paras.length) out.push({ file, slug: current.slug, words: paras[0], rest: paras.slice(1).join('\n\n'), scope })
    current = null
  }
  for (const l of readLines(path)) {
    const h = /^###\s+([a-z0-9-]+)\s*$/.exec(l)
    if (h) {
      close()
      current = { slug: h[1], paras: [[]] }
    } else if (/^#{1,2}\s/.test(l)) {
      close()
    } else if (current) {
      if (l.trim() === '') current.paras.push([])
      else current.paras[current.paras.length - 1].push(l.trim())
    }
  }
  close()
  return out
}

// ---------------------------------------------------------------------------
// The ontology, from src/ontology/registry.json.

export interface Registry {
  objectTypes: { name: string; status: string; definedIn?: string; note?: string }[]
  rejectedAsNouns: string[]
  links: {
    name: string
    from: string
    to: string
    via?: { table: string; column: string } | null
    writtenBy?: string[]
    ruled: string | null
    built: boolean
    note?: string
  }[]
  handlers: string[]
}

export function readRegistry(path: string): Registry {
  return JSON.parse(readFileSync(path, 'utf8')) as Registry
}

/** A stable record id from free words: `a Member owns a Page` → `a-member-owns-a-page`. */
export function slugOf(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
