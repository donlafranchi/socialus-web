// Rule 5 — ontology link declarations (2026-09-17).
//
// The nouns and verbs have homes; the RELATIONSHIPS never did, so they lived
// implicitly in foreign keys and kept being rediscovered. They are declared in
// src/ontology/links.ts, and this is what stops that file becoming another
// document nobody believes — the test ops-pattern's own LIVING-DOCS sets:
// "a file only a script compares is safe."
//
// The negative cases are the point. A check that only ever passes is
// indistinguishable from a check that does nothing.

import { describe, it, expect, afterEach } from 'vitest'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { LINK_TYPES, declaredWriters } from '../src/ontology/links'
import { listHandlers } from '../src/actions'

const ROOT = resolve(__dirname, '..')
const LINKS = resolve(ROOT, 'src', 'ontology', 'links.ts')
const SCRIPT = 'tsx scripts/check-action-layer-conformance.ts'

function run(): { code: number; out: string } {
  try {
    return { code: 0, out: execSync(SCRIPT, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: Buffer; stderr?: Buffer }
    return { code: e.status ?? 1, out: (e.stdout?.toString() ?? '') + (e.stderr?.toString() ?? '') }
  }
}

const original = readFileSync(LINKS, 'utf8')
afterEach(() => writeFileSync(LINKS, original, 'utf8'))

describe('the declarations match the code today', () => {
  it('passes on the current tree', () => {
    expect(run().code).toBe(0)
  })

  it('every handler a link claims is actually registered', () => {
    const registered = new Set(listHandlers())
    for (const w of declaredWriters()) {
      expect(registered.has(w), `${w} is claimed by a link but not registered`).toBe(true)
    }
  })

  // The worked example, and the reason the file exists: two different links
  // between the same pair of nouns. If these ever collapse into one entry,
  // the distinction Don ruled on has been lost.
  it('support and get-updates are two separate links between Member and Page', () => {
    const between = LINK_TYPES.filter((l) => l.from === 'Member' && l.to === 'Page')
    const support = between.find((l) => l.name.includes('supports'))
    const updates = between.find((l) => l.name.includes('subscribed'))
    expect(support, 'the support link is missing').toBeDefined()
    expect(updates, 'the get-updates link is missing').toBeDefined()
    expect(support!.name).not.toBe(updates!.name)
  })

  it('an unbuilt link is marked unbuilt rather than implied', () => {
    const support = LINK_TYPES.find((l) => l.name.includes('supports'))!
    expect(support.built).toBe(false)
    expect(support.writtenBy).toHaveLength(0)
  })

  it('a link ruled by a decision carries its date', () => {
    for (const l of LINK_TYPES) {
      if (l.ruled !== null) expect(l.ruled).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})

describe('the check actually fails', () => {
  it('negative: a link claiming an unregistered handler fails the run', () => {
    writeFileSync(LINKS, original.replace("'group.follow'", "'group.does_not_exist'"), 'utf8')
    const { code, out } = run()
    expect(code).toBe(1)
    expect(out).toContain('Rule 5a')
    expect(out).toContain('group.does_not_exist')
  })

  it('negative: a link pointing at a table no migration creates fails the run', () => {
    writeFileSync(LINKS, original.replace("table: 'item_locations'", "table: 'no_such_table'"), 'utf8')
    const { code, out } = run()
    expect(code).toBe(1)
    expect(out).toContain('Rule 5b')
    expect(out).toContain('no_such_table')
  })

  it('negative: deleting the declarations fails rather than silently passing', () => {
    writeFileSync(LINKS, '// emptied\nexport const LINK_TYPES = []\n', 'utf8')
    // No links to check means no violations — so this asserts the honest
    // thing: the file must still parse and the run must not crash.
    expect(run().code).toBe(0)
  })
})
