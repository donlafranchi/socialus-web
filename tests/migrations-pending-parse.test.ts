// The preflight has to parse what the CLI actually prints in CI.
//
// Run 35469653868 (2026-09-19, the first real run of this script) died with
// "Could not read the remote migration history" before `db push`. The remote
// history was readable — the step above it printed the whole table. The
// preflight could not READ it: `supabase migration list` emits markdown when
// stdout is not a TTY, so every cell arrives backtick-wrapped, and the parser
// required ^[0-9]+$ after stripping only spaces. In a terminal the CLI renders
// the same table without backticks, which is why it passed by hand.
//
// The old test greps this script's source for strings. A grep cannot see a
// parse bug, so these tests EXECUTE it against captured CI output instead.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'

const ROOT = resolve(__dirname, '..')

const versions = readdirSync(join(ROOT, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql'))
  .map((f) => f.replace(/^(\d+)_.*$/, '$1'))
  .sort()

const newest = versions[versions.length - 1]

// Exactly the shape run 35469653868 logged, backticks and all.
function table(remote: string[], localOnly: string[]): string {
  const cell = (v: string, w: number) => `\`${v}\``.padEnd(w)
  const rows = [
    ...remote.map((v) => `   ${cell(v, 17)}| ${cell(v, 17)}| \`t\``),
    ...localOnly.map((v) => `   ${cell(v, 17)}| \` \`             | \`t\``),
  ]
  return [
    'Connecting to remote database...',
    '',
    '  ',
    '   Local            | Remote           | Time (UTC)            ',
    '  ------------------|------------------|-----------------------',
    ...rows,
    '',
  ].join('\n')
}

let bin: string

function fakeCli(stdout: string, exitCode = 0) {
  writeFileSync(
    join(bin, 'supabase'),
    `#!/usr/bin/env bash\ncat <<'TABLE'\n${stdout}\nTABLE\nexit ${exitCode}\n`,
    { mode: 0o755 },
  )
}

function runPreflight(): { code: number; out: string } {
  try {
    const out = execFileSync('bash', ['scripts/migrations-pending.sh'], {
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

beforeAll(() => {
  bin = mkdtempSync(join(tmpdir(), 'preflight-'))
})
afterAll(() => {
  rmSync(bin, { recursive: true, force: true })
})

describe('the preflight reads the history the CLI actually prints', () => {
  it('parses the backtick-wrapped table CI gets, and names what is pending', () => {
    fakeCli(table(versions.slice(0, -1), [newest]))
    const { code, out } = runPreflight()
    expect(out).not.toMatch(/Could not read the remote migration history/)
    expect(code).toBe(0)
    expect(out).toMatch(/1 migration\(s\) to apply/)
    expect(out).toContain(newest)
  })

  it('still parses the plain table a terminal renders', () => {
    const plain = table(versions.slice(0, -1), [newest]).replace(/`/g, ' ')
    fakeCli(plain)
    const { code, out } = runPreflight()
    expect(code).toBe(0)
    expect(out).toContain(newest)
  })

  it('exits 3 — not 2 — when this ref has nothing the database lacks', () => {
    fakeCli(table(versions, []))
    const { code, out } = runPreflight()
    expect(code).toBe(3)
    expect(out).toMatch(/Nothing to apply from this ref/)
    // The no-op branch walks every remote ref with `git ls-tree` to name the
    // one that DOES have something. That is the slow path on purpose.
  }, 60_000)

  it('refuses to guess, and shows the CLI output, when the history is unreadable', () => {
    fakeCli('failed to connect to postgres', 1)
    const { code, out } = runPreflight()
    expect(code).toBe(2)
    expect(out).toMatch(/Could not read the remote migration history/)
    // The old failure printed one line and nothing to diagnose from.
    expect(out).toMatch(/failed to connect to postgres/)
  })
})
