// #386, #394 — the Ignored Build Step: which pushes build a Vercel preview.
import { describe, it, expect } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { decide } from '../scripts/vercel-ignore.mjs'

const SCRIPT = resolve('scripts/vercel-ignore.mjs')
type In = { env: Record<string, string>; changed: string[] | null; labels: string[] | null; asked: boolean }
const v = (o: In) => (decide(o) as [string, string])[0]

describe('#394 — previews only for main and labelled PRs (Don ruled C, 2026-10-05)', () => {
  const preview = { VERCEL_ENV: 'preview' }
  const code = ['src/app/page.tsx']

  it('production always builds, even docs-only', () => {
    expect(v({ env: { VERCEL_ENV: 'production' }, changed: ['docs/a.md'], labels: [], asked: true })).toBe('build')
  })
  it('a PR labelled human-review or needs-don builds', () => {
    expect(v({ env: preview, changed: code, labels: ['human-review'], asked: true })).toBe('build')
    expect(v({ env: preview, changed: code, labels: ['change', 'needs-don'], asked: true })).toBe('build')
  })
  it('no labelled PR: skips', () => {
    expect(v({ env: preview, changed: code, labels: ['change'], asked: true })).toBe('skip')
    expect(v({ env: preview, changed: code, labels: [], asked: true })).toBe('skip')
  })
  it('the empty commit a label pushes still builds', () => {
    expect(v({ env: preview, changed: [], labels: ['human-review'], asked: true })).toBe('build')
  })
  it('docs-only skips even when labelled', () => {
    expect(v({ env: preview, changed: ['build-log/x.md', 'tests/a.test.ts'], labels: ['human-review'], asked: true })).toBe('skip')
  })
  it('GitHub unreachable: builds rather than lose a preview', () => {
    expect(v({ env: preview, changed: code, labels: null, asked: true })).toBe('build')
  })
  it('no token yet: the #386 rule alone, so code builds', () => {
    expect(v({ env: preview, changed: code, labels: null, asked: false })).toBe('build')
  })
})

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
  const r = spawnSync(process.execPath, [SCRIPT], { cwd: dir, env: { PATH: process.env.PATH!, NODE_ENV: 'test', ...env } })
  return r.status === 0 ? 'skip' : 'build'
}

describe('#386 — the script itself, with no token (the fallback)', () => {
  it.each([[['docs/a.md']], [['.github/workflows/ci.yml']], [['tests/a.test.ts', 'evals/x.spec.ts', 'README.md']]])('skips %j', (files) => {
    expect(pushOf(files)).toBe('skip')
  })
  it.each([[['src/app/page.tsx']], [['docs/a.md', 'package.json']], [['supabase/migrations/1.sql']]])('builds %j', (files) => {
    expect(pushOf(files)).toBe('build')
  })
  it('production always builds', () => {
    expect(pushOf(['docs/a.md'], { VERCEL_ENV: 'production' })).toBe('build')
  })
})
