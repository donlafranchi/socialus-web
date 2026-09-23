// A suite that shells out has to be in a project that lets it.
//
// Vitest's default timeout is 5s. Spawning `tsx` or `npx eslint` and waiting
// for it does not reliably fit in 5s while the rest of the suite is using the
// cores — so `probe` and `subprocess` both carry a 60s budget.
//
// SIX FILES SPAWNED SUBPROCESSES AND WERE IN NEITHER, and on 2026-09-23 that
// produced seven timeouts across four branches in one day. Always a timeout,
// never an assertion, always green when run alone. Three times it cost a clean
// verification and once it masked a check that mattered — a stale migration
// manifest on a branch that changed migrations.
//
// This is the guard against the seventh file. It reads the config's own lists
// rather than restating them, so the two cannot drift.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'

const ROOT = resolve(__dirname, '..')

/** Pull a string-array const out of vitest.config.ts by name. */
function listFromConfig(name: string): string[] {
  const config = readFileSync(resolve(ROOT, 'vitest.config.ts'), 'utf8')
  const block = config.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\]`))
  if (!block) throw new Error(`${name} not found in vitest.config.ts`)
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

/** Every .test.ts/.tsx under tests/ and src/. */
function allTestFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) allTestFiles(full, acc)
    else if (/\.test\.tsx?$/.test(entry.name)) acc.push(relative(ROOT, full))
  }
  return acc
}

/** Does this file start a child process? */
const SPAWNS = /\b(execFileSync|execSync|spawnSync|execFile|spawn)\s*\(/

describe('a suite that shells out is in a project that lets it', () => {
  it('has no subprocess suite running against the 5s default', () => {
    const allowed = new Set([
      ...listFromConfig('PROBE_SUITES'),
      ...listFromConfig('SUBPROCESS_SUITES'),
    ])

    const stray = allTestFiles(resolve(ROOT, 'tests'))
      .concat(allTestFiles(resolve(ROOT, 'src')))
      .filter((f) => SPAWNS.test(readFileSync(resolve(ROOT, f), 'utf8')))
      .filter((f) => !allowed.has(f))

    expect(
      stray,
      'These spawn a subprocess but run in the `unit` project, where the ' +
        'timeout is 5s. Add them to SUBPROCESS_SUITES in vitest.config.ts — ' +
        'or to PROBE_SUITES if they also write under src/.',
    ).toEqual([])
  })

  it('lists no file that does not exist', () => {
    // A rename that misses the config leaves a phantom entry, and the suite
    // silently stops covering the real file.
    const all = new Set(allTestFiles(resolve(ROOT, 'tests')).concat(allTestFiles(resolve(ROOT, 'src'))))
    for (const name of ['PROBE_SUITES', 'SUBPROCESS_SUITES']) {
      for (const f of listFromConfig(name)) {
        expect(all.has(f), `${name} names ${f}, which is not a test file on disk`).toBe(true)
      }
    }
  })

  it('puts no file in both projects', () => {
    const probe = listFromConfig('PROBE_SUITES')
    const sub = listFromConfig('SUBPROCESS_SUITES')
    expect(probe.filter((f) => sub.includes(f))).toEqual([])
  })
})
