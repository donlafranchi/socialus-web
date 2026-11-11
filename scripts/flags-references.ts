// #1227 Finds every flag the code reads, and every flag past its removal date.
// Static: reads src/ and the registry, never the database, so it runs in
// `npm test` and on any laptop.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FLAGS, type FlagDeclaration } from '../src/lib/flags/registry'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export type Reference = { key: string | null; file: string; line: number }

// flagOn('key') or flagOnFor('key', ...) with a literal key and nothing else
// in that argument. Anything else is reported as unreadable, because a key the
// check cannot see is a flag nobody can find. So is an aliased import.
const CALL = /\bflagOn(?:For)?\(\s*(?:(['"`])([^'"`$]*)\1\s*(?=[,)]))?/g
const ALIAS = /\bflagOn(?:For)?\s+as\b/g

/** Comments blanked, line breaks kept, so a commented-out read is not a read. */
export function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1')
}

export function referencesIn(raw: string, file: string): Reference[] {
  const text = stripComments(raw)
  const lineOf = (i: number) => text.slice(0, i).split('\n').length
  const out: Reference[] = []
  for (const m of text.matchAll(CALL)) out.push({ key: m[2] ?? null, file, line: lineOf(m.index) })
  for (const m of text.matchAll(ALIAS)) out.push({ key: null, file, line: lineOf(m.index) })
  return out.sort((a, b) => a.line - b.line)
}

function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, files)
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name) && !/\.(test|spec)\.[jt]sx?$/.test(name)) files.push(p)
  }
  return files
}

/** Every flagOn call under src/, except the flag module itself. */
export function codeReferences(root = ROOT): Reference[] {
  const src = join(root, 'src')
  const own = join(src, 'lib', 'flags') + sep
  return walk(src)
    .filter((f) => !f.startsWith(own))
    .flatMap((f) => referencesIn(readFileSync(f, 'utf8'), relative(root, f)))
}

export type Report = {
  undeclared: Reference[]
  unread: string[]
  pastDue: { key: string; removeBy: string; hides: string; issue: number }[]
  badDates: string[]
  references: Reference[]
}

export function report(
  flags: Record<string, FlagDeclaration> = FLAGS,
  references: Reference[] = codeReferences(),
  today = new Date().toISOString().slice(0, 10),
): Report {
  const declared = new Set(Object.keys(flags))
  const read = new Set(references.map((r) => r.key))
  const entries = Object.entries(flags)
  return {
    undeclared: references.filter((r) => r.key === null || !declared.has(r.key)),
    unread: entries.map(([k]) => k).filter((k) => !read.has(k)),
    pastDue: entries
      .filter(([, d]) => d.removeBy < today)
      .map(([key, d]) => ({ key, removeBy: d.removeBy, hides: d.hides, issue: d.issue })),
    badDates: entries
      .filter(([, d]) => !/^\d{4}-\d{2}-\d{2}$/.test(d.removeBy) || Number.isNaN(Date.parse(d.removeBy)))
      .map(([k]) => k),
    references,
  }
}
