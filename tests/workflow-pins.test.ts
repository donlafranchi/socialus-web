// The runner pin and the action versions, guarded.
//
// The pin is the important half. `ubuntu-latest` migrates to Ubuntu 26 from
// 2026-10-19 — eleven days before launch. An unpinned runner would change the
// OS, the toolchain and the default package versions underneath us in the worst
// week of the project, and the first symptom would be a job failing for a
// reason unrelated to anything anyone changed.
//
// This test exists because the pin is exactly the kind of thing the NEXT
// workflow forgets. A new file with `ubuntu-latest` would inherit the migration
// silently; now it fails here instead.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DIR = resolve(__dirname, '..', '.github/workflows')
const files = readdirSync(DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))

/** Workflow text with comments stripped — assertions are about steps, not prose. */
function code(file: string): string {
  return readFileSync(resolve(DIR, file), 'utf8').replace(/^\s*#.*$/gm, '')
}

describe('every runner is pinned', () => {
  it('finds workflows to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files)('%s never uses a floating runner label', (file) => {
    const s = code(file)
    expect(s).not.toMatch(/runs-on:\s*ubuntu-latest/)
    expect(s).not.toMatch(/runs-on:\s*(macos|windows)-latest/)
  })

  it.each(files)('%s pins every job to ubuntu-24.04', (file) => {
    for (const line of code(file).split('\n')) {
      if (/^\s*runs-on:/.test(line)) expect(line).toContain('ubuntu-24.04')
    }
  })
})

describe('every action targets a supported Node', () => {
  // Node 20 is deprecated; these majors are the first that declare node24.
  const MINIMUM: Record<string, number> = {
    'actions/checkout': 5,
    'actions/setup-node': 5,
    'actions/github-script': 8,
    // #269 — v6 is the first that declares node24.
    'actions/upload-artifact': 6,
    // v2 is `using: composite` — no Node runtime at all, so it cannot emit the
    // warning. Deliberately NOT v3, which switches the CLI install from GitHub
    // releases to npm; that is a real behaviour change on the workflow that
    // writes to production, taken for no benefit we need.
    'supabase/setup-cli': 2,
  }

  it.each(files)('%s uses no action below its minimum major', (file) => {
    for (const m of code(file).matchAll(/uses:\s*([\w-]+\/[\w-]+)@v(\d+)/g)) {
      const [, action, major] = m
      const min = MINIMUM[action]
      expect(min, `${action} is not in the minimum table — add it`).toBeDefined()
      expect(Number(major), `${file}: ${action}@v${major} is below v${min}`).toBeGreaterThanOrEqual(min)
    }
  })

  it('knows about every action actually used', () => {
    const used = new Set<string>()
    for (const f of files) {
      for (const m of code(f).matchAll(/uses:\s*([\w-]+\/[\w-]+)@/g)) used.add(m[1])
    }
    expect([...used].sort()).toEqual(Object.keys(MINIMUM).sort())
  })
})

describe('the production apply workflow keeps its safety properties', () => {
  const s = code('apply.yml')

  it('still checks out full history for the wrong-ref guard', () => {
    expect(s).toMatch(/fetch-depth:\s*0/)
  })

  it('still runs the preflight before pushing', () => {
    expect(s.indexOf('migrations-pending.sh')).toBeLessThan(s.indexOf('supabase db push'))
  })

  it('is still manual only — no push trigger, no schedule', () => {
    expect(s).toMatch(/workflow_dispatch:/)
    expect(s).not.toMatch(/^\s*(push|schedule):/m)
  })
})
