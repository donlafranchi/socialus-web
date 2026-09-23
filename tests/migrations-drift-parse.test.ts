// bug #209 — the drift check has to parse what the CLI actually prints in CI.
//
// `supabase migration list` emits a markdown table when stdout is not a TTY,
// so every cell arrives backtick-wrapped and an ABSENT cell arrives as '` `'.
// The parser stripped whitespace and not backticks, so that cell survived as
// two backticks — non-empty — and an unapplied migration was classified as
// neither local-only nor remote-only. The script reported "clean", and the
// three checks built on it passed without asking their question:
// #188's merge gate, the daily "Production behind main?", and the remote-only
// drift check that exists because of the 2026-09-11 divergence.
//
// THIS FILE EXECUTES THE SCRIPT. Its sibling, migrations-pending-parse.test.ts,
// says why in its own header: "a grep cannot see a parse bug". That test was
// written for this exact failure on 2026-09-19 and fixed the OTHER script;
// this one has the same parser and had no test at all.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'

const ROOT = resolve(__dirname, '..')

/** Exactly the shape CI logs — backticks and all, absent cells as '` `'. */
function table(rows: { local?: string; remote?: string }[]): string {
  const cell = (v: string | undefined, w: number) => `\`${v ?? ' '}\``.padEnd(w)
  return [
    'Connecting to remote database...',
    '',
    '  ',
    '   Local            | Remote           | Time (UTC)            ',
    '  ------------------|------------------|-----------------------',
    ...rows.map((r) => `   ${cell(r.local, 17)}| ${cell(r.remote, 17)}| \`t\``),
    '',
  ].join('\n')
}

/** The same table as a terminal renders it — no backticks. */
function plainTable(rows: { local?: string; remote?: string }[]): string {
  const cell = (v: string | undefined, w: number) => (v ?? '').padEnd(w)
  return [
    '   Local            | Remote           | Time (UTC)            ',
    '  ------------------|------------------|-----------------------',
    ...rows.map((r) => `   ${cell(r.local, 17)}| ${cell(r.remote, 17)}| t`),
    '',
  ].join('\n')
}

let bin: string

function fakeCli(stdout: string) {
  writeFileSync(
    join(bin, 'supabase'),
    `#!/usr/bin/env bash\ncat <<'TABLE'\n${stdout}\nTABLE\nexit 0\n`,
    { mode: 0o755 },
  )
}

function run(...args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync('bash', ['scripts/check-migration-drift.sh', ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, SUPABASE_DB_URL: 'postgresql://stub' },
    })
    return { code: 0, out }
  } catch (e) {
    const err = e as { status: number; stdout?: string; stderr?: string }
    return { code: err.status, out: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

const APPLIED = { local: '20260921200710', remote: '20260921200710' }
const PENDING = { local: '20260922204457' }
const GHOST = { remote: '20260911999999' }

beforeAll(() => {
  bin = mkdtempSync(join(tmpdir(), 'drift-'))
})
afterAll(() => {
  rmSync(bin, { recursive: true, force: true })
})

describe('an unapplied migration, in the backtick table CI gets', () => {
  it('FAILS under --strict — this is #188’s merge gate', () => {
    fakeCli(table([APPLIED, PENDING]))
    const { code, out } = run('--strict')
    // The regression: this exited 0 and said "clean".
    expect(code).toBe(1)
    expect(out).toMatch(/not yet applied/i)
    expect(out).toContain('20260922204457')
  })

  it('is reported but passes WITHOUT --strict — a PR is supposed to carry one', () => {
    fakeCli(table([APPLIED, PENDING]))
    const { code, out } = run()
    expect(code).toBe(0)
    expect(out).toMatch(/not yet applied/i)
    expect(out).toContain('20260922204457')
  })
})

describe('a migration in the database with no file — always drift', () => {
  it('FAILS in the backtick table, in either mode', () => {
    for (const args of [[], ['--strict']]) {
      fakeCli(table([APPLIED, GHOST]))
      const { code, out } = run(...args)
      expect(code, `args: ${JSON.stringify(args)}`).toBe(1)
      expect(out).toMatch(/the database has migrations this repo does not/i)
      expect(out).toContain('20260911999999')
    }
  })
})

describe('everything applied', () => {
  it('passes in both modes and says so', () => {
    for (const args of [[], ['--strict']]) {
      fakeCli(table([APPLIED]))
      const { code, out } = run(...args)
      expect(code).toBe(0)
      expect(out).toMatch(/clean/i)
    }
  })
})

describe('the terminal rendering still works', () => {
  // The format it always handled. Stripping backticks must not break the
  // shape a human sees when they run it by hand.
  it('detects a pending migration with no backticks at all', () => {
    fakeCli(plainTable([APPLIED, PENDING]))
    const { code, out } = run('--strict')
    expect(code).toBe(1)
    expect(out).toContain('20260922204457')
  })

  it('detects drift with no backticks at all', () => {
    fakeCli(plainTable([APPLIED, GHOST]))
    const { code } = run()
    expect(code).toBe(1)
  })
})
