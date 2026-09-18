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
