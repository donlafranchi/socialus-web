// bug #224 — the merge gate's message has to name the direction that failed.
//
// On #217 production held 20260923161500 and the branch did not. The step
// printed "This branch carries a migration production does not have. Apply it
// FIRST" — the opposite of the truth, and advice that fixes nothing: there was
// nothing on the branch to apply. The fix was to bring the branch up to main.
//
// THIS FILE EXECUTES THE STEP'S OWN SHELL, lifted from ci.yml, against a stub
// drift script, so the message is judged by what runs rather than by a grep.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'

const STEP = 'Every migration here is already in the database'

function stepScript(): string {
  const lines = readFileSync(resolve(__dirname, '../.github/workflows/ci.yml'), 'utf8').split('\n')
  const at = lines.findIndex((l) => l.includes(`name: ${STEP}`))
  expect(at, `step "${STEP}" not found in ci.yml`).toBeGreaterThan(-1)
  const runAt = lines.findIndex((l, i) => i > at && /^\s+run: \|\s*$/.test(l))
  const indent = lines[runAt + 1]!.match(/^\s*/)![0].length
  const body: string[] = []
  for (const l of lines.slice(runAt + 1)) {
    if (l.trim() && l.match(/^\s*/)![0].length < indent) break
    body.push(l.slice(indent))
  }
  return body.join('\n')
}

let dir: string

function runStep(driftExit: number): { code: number; out: string } {
  writeFileSync(join(dir, 'scripts/check-migration-drift.sh'), `exit ${driftExit}\n`)
  writeFileSync(join(dir, 'step.sh'), stepScript())
  try {
    return { code: 0, out: execFileSync('bash', ['step.sh'], { cwd: dir, encoding: 'utf8' }) }
  } catch (e) {
    const err = e as { status: number; stdout?: string }
    return { code: err.status, out: err.stdout ?? '' }
  }
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'gate-'))
  mkdirSync(join(dir, 'scripts'))
})
afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('the merge gate says which way production and the branch disagree', () => {
  it('passes when the drift check passes', () => {
    expect(runStep(0).code).toBe(0)
  })

  it('branch has a migration production lacks: apply it first', () => {
    const { code, out } = runStep(2)
    expect(code).toBe(1)
    expect(out).toMatch(/this branch carries a migration production does not have/i)
    expect(out).toMatch(/apply it first/i)
    // 2026-10-02 — the instruction is the terminal command, naming the branch.
    expect(out).toMatch(/gh workflow run apply\.yml --ref \S+/ -f confirm=apply)
  })

  it('production has a migration the branch lacks: never tells you to apply', () => {
    const { code, out } = runStep(3)
    expect(code).toBe(1)
    expect(out).not.toMatch(/this branch carries a migration production does not have/i)
    expect(out).not.toMatch(/apply it first/i)
    expect(out).toMatch(/production has a migration this branch does not/i)
    expect(out).toMatch(/main/)
  })

  it('a failure that is neither claims neither', () => {
    const { code, out } = runStep(1)
    expect(code).toBe(1)
    expect(out).not.toMatch(/this branch carries|production has a migration/i)
  })
})
