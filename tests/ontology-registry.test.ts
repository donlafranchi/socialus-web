// The generated registry, and the parsers that read the source instead.
//
// `src/ontology/registry.json` exists so readers outside this repo's compiler
// — ops-pattern's STATUS.md job, which reaches across with a read token and
// `git show origin/main:<path>` — get the ontology as DATA rather than as a
// TypeScript literal they have to regex. It is committed because that reader
// cannot run a script here, and committed files go stale, so this is what
// stops it: regenerate in memory, compare, fail.
//
// The second describe is lesson 28 applied to what is left. One parser of
// links.ts survives on purpose (the conformance check needs line numbers an
// import cannot give), and a regex that quietly matches nothing is exactly how
// a guard passes while doing nothing. So the regex is checked against the
// values it is standing in for.

import { describe, it, expect, afterEach } from 'vitest'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildRegistry } from '../scripts/ontology-registry'
import { LINK_TYPES } from '../src/ontology/links'
import { OBJECT_TYPES, REJECTED_AS_NOUNS } from '../src/ontology/objects'
import { listHandlers } from '../src/actions'

const ROOT = resolve(__dirname, '..')
const REGISTRY = resolve(ROOT, 'src/ontology/registry.json')

describe('the committed registry matches its source', () => {
  it('is not stale', () => {
    const committed = readFileSync(REGISTRY, 'utf8')
    expect(
      committed,
      'src/ontology/registry.json is stale — run: npm run ontology:registry',
    ).toBe(buildRegistry())
  })

  it('generates identically twice — nothing in it is a timestamp', () => {
    // A field that changes every run makes the check above meaningless.
    expect(buildRegistry()).toBe(buildRegistry())
  })

  it('carries every declared link, every noun and every handler', () => {
    const r = JSON.parse(buildRegistry())
    expect(r.schema).toBe(2)
    expect(r.links).toHaveLength(LINK_TYPES.length)
    expect(r.objectTypes).toHaveLength(OBJECT_TYPES.length)
    expect(r.rejectedAsNouns).toEqual([...REJECTED_AS_NOUNS])
    expect(r.handlers).toEqual(listHandlers())
  })

  it('carries no schema detail beyond the table and column links.ts names', () => {
    // The hard constraint: this must not become a second description of the
    // database. Everything comes from the declarations; nothing is added.
    const r = JSON.parse(buildRegistry())
    for (const o of r.objectTypes) {
      // A pointer carries no table and no column. Nothing else may appear.
      expect(Object.keys(o).sort()).toEqual(['definedIn', 'name', 'note', 'status'])
    }
    for (const l of r.links) {
      expect(Object.keys(l.via).sort()).toEqual(['column', 'table'])
      expect(Object.keys(l).sort()).toEqual(
        ['built', 'from', 'name', 'note', 'ruled', 'to', 'via', 'writtenBy'].sort(),
      )
    }
  })
})

describe('the one surviving regex still matches what it stands for', () => {
  it("the conformance check's handler pattern finds exactly the registered handlers", () => {
    // Rule 5a fails a link whose handler this regex cannot find. If the regex
    // stops matching — a renamed const, a reformatted registry — every link
    // fails at once, or worse, none do. Pin it to the real list.
    const src = readFileSync(resolve(ROOT, 'src/actions/index.ts'), 'utf8')
    const body = src.slice(src.indexOf('const REGISTRY'), src.indexOf('export function getHandler'))
    const found = [...body.matchAll(/^\s*'([a-z_]+(?:\.[a-z_]+)+)':/gm)].map((m) => m[1]).sort()
    expect(found).toEqual(listHandlers().sort())
  })

  it("the conformance check's link pattern finds exactly the declared links", () => {
    const src = readFileSync(resolve(ROOT, 'src/ontology/links.ts'), 'utf8')
    const names: string[] = []
    for (const m of src.matchAll(/name:\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
      const after = src.slice(m.index ?? 0)
      if (after.match(/via:\s*\{\s*table:\s*'([a-z0-9_]+)'/)) names.push(m[2])
    }
    expect(names).toEqual(LINK_TYPES.map((l) => l.name))
  })
})

// --check is what a person or a workflow runs. An untested mode is the one
// that silently passes — the whole of lesson 28 — so it is exercised, not
// merely present.
describe('--check fails on a stale file', () => {
  const original = readFileSync(REGISTRY, 'utf8')
  afterEach(() => writeFileSync(REGISTRY, original, 'utf8'))

  function check(): number {
    try {
      execSync('tsx scripts/ontology-registry.ts --check', {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      return 0
    } catch (err) {
      return (err as { status?: number }).status ?? 1
    }
  }

  it('passes on the committed file', () => {
    expect(check()).toBe(0)
  })

  it('fails when the file no longer matches its source', () => {
    // Mutated through JSON rather than by replacing a literal. The first
    // version of this swapped the string `"schema": 1`, and bumping the schema
    // to 2 turned the setup into a no-op that wrote the file back unchanged —
    // the assertion below caught it, but a setup that can silently do nothing
    // is the shape of every guard that passes while checking nothing.
    const parsed = JSON.parse(original)
    parsed.links.pop()
    const mutated = JSON.stringify(parsed, null, 2) + '\n'
    expect(mutated, 'the mutation did not change the file').not.toBe(original)
    writeFileSync(REGISTRY, mutated, 'utf8')
    expect(check()).toBe(1)
  })

  it('fails when the file is empty rather than reading it as clean', () => {
    writeFileSync(REGISTRY, '', 'utf8')
    expect(check()).toBe(1)
  })
})
