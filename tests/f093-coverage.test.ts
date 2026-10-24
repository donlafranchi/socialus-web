import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

// #1017 — F093 criterion 12 as a standing check: each of criteria 1-11 keeps a whole marker (not partial) on a
// check in a test file. A marker deleted, demoted to partial, or moved into a non-test file turns this red.
// Markers are matched from pieces so this file's own text is never one.

const ROOT = resolve(__dirname, '..')
const OPEN = '\\[' + 'guards F093\\.'
const WHOLE = (n: number) => new RegExp(`${OPEN}${n}\\]`)
const CRITERIA = Array.from({ length: 11 }, (_, i) => i + 1)
const IS_TEST = /\.test\.(ts|tsx)$/

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

/** Criteria among 1-11 with no whole marker on a line of a test file. A marker inside backticks is a mention. */
export function unguarded(files: Record<string, string>): number[] {
  const testFiles = Object.entries(files).filter(([path]) => IS_TEST.test(path))
  return CRITERIA.filter(
    (n) => !testFiles.some(([, text]) => text.split('\n').some((line) => WHOLE(n).test(line.replace(/`[^`]*`/g, '')))),
  )
}

const tree = (): Record<string, string> => {
  const files: Record<string, string> = {}
  for (const dir of ['src', 'tests'])
    for (const p of walk(join(ROOT, dir))) if (/\.(ts|tsx)$/.test(p)) files[relative(ROOT, p)] = readFileSync(p, 'utf8')
  return files
}

const mark = (n: number, partial = '') => `// [${'guards'} F093.${n}${partial}]`
const full = () => Object.fromEntries(CRITERIA.map((n) => [`tests/c${n}.test.ts`, `${mark(n)}\nit('x', () => {})`]))

describe('F093 criterion 12 — every criterion 1-11 has a whole marked check', () => {
  // [guards F093.12 partial: that each of 1-11 carries a whole marker in a test file; that each marked check was seen failing is recorded in the PR that added it, which no test can read]
  it('finds a whole marker for each of criteria 1-11 in the tree, and rejects a tree that has lost one', () => {
    // The checker accepts a complete set and names what is missing.
    expect(unguarded(full())).toEqual([])
    for (const n of CRITERIA) {
      const without = full()
      delete without[`tests/c${n}.test.ts`]
      expect(unguarded(without), `criterion ${n} removed`).toEqual([n])
    }
    // A partial marker, a marker in a non-test file, and a mention in backticks do not count.
    expect(unguarded({ ...full(), 'tests/c4.test.ts': `${mark(4, ' partial: the photo')}\nit('x', () => {})` })).toEqual([4])
    expect(unguarded({ ...full(), 'tests/c4.test.ts': '', 'src/c4.ts': mark(4) })).toEqual([4])
    expect(unguarded({ ...full(), 'tests/c4.test.ts': 'see `' + mark(4) + '`' })).toEqual([4])
    // Markers for another scenario's criterion 4 do not count.
    expect(unguarded({ ...full(), 'tests/c4.test.ts': mark(4).replace('F093', 'F094') })).toEqual([4])

    // The real tree.
    const files = tree()
    expect(unguarded(files), 'F093 criteria with no whole marked check').toEqual([])
    // And the real tree minus any one criterion's markers fails on exactly that criterion.
    for (const n of CRITERIA) {
      // Only test files can carry a marker, so only they are rewritten; the rest is reused as read once.
      const stripped = { ...files }
      for (const [p, t] of Object.entries(files))
        if (IS_TEST.test(p) && t.includes(`F093.${n}]`)) stripped[p] = t.split('\n').filter((l) => !WHOLE(n).test(l)).join('\n')
      expect(unguarded(stripped), `real tree without F093.${n}`).toEqual([n])
    }
  }, 60_000)
})
