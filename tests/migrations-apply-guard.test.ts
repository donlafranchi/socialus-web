// The wrong-ref guard on the production apply workflow.
//
// The failure it exists to stop: `workflow_dispatch` shows a "Use workflow
// from" dropdown defaulting to main. A migration under review lives on its
// branch until the PR merges, so accepting the default runs the job against a
// ref with nothing pending — `db push` says "Remote database is up to date",
// the job goes GREEN, and the migration was not applied. A green run and a run
// that did nothing are indistinguishable from the run list.
//
// It happened twice. The fix is not a note in a PR body, which relies on
// someone remembering the thing they just forgot.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '..')
const wfRaw = readFileSync(resolve(ROOT, '.github/workflows/migrations-apply-production.yml'), 'utf8')
// The header comment explains at length why `db push` and not the management
// API, so it mentions both. Match STEPS, not prose — otherwise the assertions
// fail on the paragraph justifying them.
const wf = wfRaw.replace(/^\s*#.*$/gm, '')
const script = readFileSync(resolve(ROOT, 'scripts/migrations-pending.sh'), 'utf8')

describe('the apply workflow refuses to be a silent no-op', () => {
  it('runs the preflight', () => {
    expect(wf).toContain('scripts/migrations-pending.sh')
  })

  it('runs it BEFORE pushing, not after', () => {
    expect(wf.indexOf('migrations-pending.sh')).toBeLessThan(wf.indexOf('supabase db push'))
  })

  it('checks out full history, so it can name the other branch', () => {
    // A shallow single-branch clone cannot see what other refs carry.
    expect(wf).toMatch(/fetch-depth:\s*0/)
  })

  it('warns about the dropdown where the person is already typing', () => {
    expect(wfRaw).toMatch(/Use workflow from/)
  })

  it('still applies with the CLI, never the management API', () => {
    expect(wf).toContain('supabase db push')
    expect(wf).not.toMatch(/apply_migration|management API call/i)
  })
})

describe('the preflight fails closed and is useful when it fails', () => {
  it('refuses to guess when the remote history cannot be read', () => {
    expect(script).toMatch(/Could not read the remote migration history/)
    expect(script).toMatch(/exit 2/)
  })

  it('exits non-zero when this ref has nothing to apply', () => {
    // Green-and-did-nothing is the whole bug. It must not be green.
    expect(script).toMatch(/exit 3/)
  })

  it('names which branches DO have something pending', () => {
    expect(script).toMatch(/Re-run this workflow with/)
    expect(script).toMatch(/refs\/remotes\/origin/)
  })

  it('caps and orders that list — a wall of branches is the same as no message', () => {
    expect(script).toMatch(/MAX_REFS=\d+/)
    expect(script).toMatch(/--sort=-committerdate/)
  })

  it('prints what it is about to apply before applying it', () => {
    expect(script).toMatch(/migration\(s\) to apply/)
  })
})

// #264 — refuse a stacked branch, and more than one pending migration unless
// overridden. On 2026-09-30 three stacked migration PRs were applied before
// any of their code merged, and signed-out Pages 404'd until it did.
import { spawnSync } from 'node:child_process'

const guardScript = resolve(ROOT, 'scripts/migrations-apply-guard.sh')
const runGuard = (env: Record<string, string>) => {
  const args = [guardScript]
  const r = spawnSync('bash', args, {
    env: { PATH: process.env.PATH ?? '', ...env } as unknown as NodeJS.ProcessEnv,
    encoding: 'utf8',
  })
  return { code: r.status, out: `${r.stdout}${r.stderr}` }
}

describe('the apply guard refuses what applies ahead of code', () => {
  it('refuses a branch whose open PR is stacked on another branch', () => {
    const r = runGuard({ BRANCH: 'f093-t173-front-door', PR_BASES: 'bug-253-member-ids', PENDING: '20260930210000' })
    expect(r.code).not.toBe(0)
    expect(r.out).toMatch(/bug-253-member-ids/)
    expect(r.out).toMatch(/stacked|not main/i)
  })

  it('passes a branch whose open PR targets main, with one migration pending', () => {
    expect(runGuard({ BRANCH: 'bug-253-member-ids', PR_BASES: 'main', PENDING: '20260930200000' }).code).toBe(0)
  })

  it('passes main itself', () => {
    expect(runGuard({ BRANCH: 'main', PENDING: '20260930200000' }).code).toBe(0)
  })

  it('refuses a branch with no open PR, rather than guessing what it is', () => {
    const r = runGuard({ BRANCH: 'someone-elses-branch', PR_BASES: '', PENDING: '20260930200000' })
    expect(r.code).not.toBe(0)
    expect(r.out).toMatch(/no open pull request/i)
  })

  it('refuses more than one pending migration without the override, and names them', () => {
    const r = runGuard({ BRANCH: 'main', PENDING: '20260930200000\n20260930210000' })
    expect(r.code).not.toBe(0)
    expect(r.out).toMatch(/20260930200000/)
    expect(r.out).toMatch(/20260930210000/)
    expect(r.out).toMatch(/allow_multiple/)
  })

  it('passes more than one with the override set', () => {
    expect(
      runGuard({ BRANCH: 'main', PENDING: '20260930200000\n20260930210000', ALLOW_MULTIPLE: 'true' }).code,
    ).toBe(0)
  })

  it('still refuses a stacked branch with the override set — it overrides the count, not the stack', () => {
    const r = runGuard({ BRANCH: 'x', PR_BASES: 'y', PENDING: '1', ALLOW_MULTIPLE: 'true' })
    expect(r.code).not.toBe(0)
  })
})

describe('the workflow runs the guard before applying anything, and proves it each run', () => {
  it('runs the guard after the preflight and before the push', () => {
    expect(wf).toContain('scripts/migrations-apply-guard.sh')
    expect(wf.indexOf('migrations-pending.sh')).toBeLessThan(wf.indexOf('migrations-apply-guard.sh'))
    expect(wf.lastIndexOf('migrations-apply-guard.sh')).toBeLessThan(wf.indexOf('supabase db push'))
  })

  it('first watches the guard refuse a stacked fixture, in the same job', () => {
    expect(wf).toMatch(/PR_BASES: some-other-branch/)
  })

  it('takes an explicit override input, off by default', () => {
    expect(wfRaw).toMatch(/allow_multiple:[\s\S]*?type: boolean[\s\S]*?default: false/)
  })

  it('can read the branch’s pull requests, and nothing more', () => {
    expect(wfRaw).toMatch(/permissions:\s*\n\s*contents: read\s*\n\s*pull-requests: read/)
  })

  it('is started by hand only: workflow_dispatch, no push, pull_request or merge_group', () => {
    const on = wfRaw.slice(wfRaw.indexOf('\non:'), wfRaw.indexOf('\nconcurrency:'))
    expect(on).toMatch(/workflow_dispatch/)
    expect(on).not.toMatch(/\b(push|pull_request|pull_request_target|merge_group|schedule|workflow_run)\b/)
  })
})
