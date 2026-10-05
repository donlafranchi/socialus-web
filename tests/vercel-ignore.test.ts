// #386 — the Ignored Build Step: which pushes skip a Vercel preview.
import { describe, it, expect } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const SCRIPT = resolve('scripts/vercel-ignore.sh')

function pushOf(files: string[], env: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'vercel-ignore-'))
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' })
  git('init', '-q')
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base')
  for (const f of files) {
    mkdirSync(dirname(join(dir, f)), { recursive: true })
    writeFileSync(join(dir, f), 'x')
  }
  git('add', '-A')
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'change')
  const r = spawnSync('bash', [SCRIPT], { cwd: dir, env: { PATH: process.env.PATH!, NODE_ENV: 'test', ...env } })
  return r.status === 0 ? 'skip' : 'build'
}

describe('#386 — skip previews that change nothing a preview shows', () => {
  it.each([
    [['docs/a.md']],
    [['build-log/2026-W41/x.md']],
    [['.github/workflows/ci.yml']],
    [['tests/a.test.ts', 'evals/features/x.spec.ts']],
    [['src/components/Foo.test.tsx', 'README.md']],
  ])('skips %j', (files) => {
    expect(pushOf(files)).toBe('skip')
  })

  it.each([[['src/app/page.tsx']], [['docs/a.md', 'src/lib/x.ts']], [['package.json']], [['supabase/migrations/1.sql']]])(
    'builds %j',
    (files) => {
      expect(pushOf(files)).toBe('build')
    },
  )

  it('production always builds, even a docs-only push', () => {
    expect(pushOf(['docs/a.md'], { VERCEL_ENV: 'production' })).toBe('build')
  })

  it('builds when it cannot tell what changed', () => {
    expect(pushOf(['docs/a.md'], { VERCEL_GIT_PREVIOUS_SHA: 'deadbeef' })).toBe('build')
  })
})
