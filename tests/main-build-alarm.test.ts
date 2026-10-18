// 2026-10-18 — a failed production build of main opens one Issue (#911 + #944 broke main unseen).
import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, mkdtempSync, chmodSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const wf = readFileSync('.github/workflows/main-build-alarm.yml', 'utf8')
const script = /run: \|\n([\s\S]+)$/.exec(wf)![1].replace(/^ {10}/gm, '')

function run(environment: string, existing: string) {
  const dir = mkdtempSync(join(tmpdir(), 'alarm-'))
  const log = join(dir, 'calls')
  writeFileSync(join(dir, 'gh'), `#!/bin/bash\necho "$@" >> ${log}\n[ "$2" = list ] && echo "${existing}"\nexit 0\n`)
  chmodSync(join(dir, 'gh'), 0o755)
  execFileSync('bash', ['-c', script], {
    env: { PATH: `${dir}:${process.env.PATH}`, REPO: 'o/r', ENVIRONMENT: environment, REF: 'main', SHA: 'afcb9110000', LOG: 'https://vercel.com/x' },
  })
  try { return readFileSync(log, 'utf8') } catch { return '' }
}

describe('main build alarm', () => {
  it('listens to deployment statuses and fires only on failure or error', () => {
    expect(wf).toMatch(/on:\n {2}deployment_status:/)
    expect(wf).toMatch(/state == 'failure' \|\| github\.event\.deployment_status\.state == 'error'/)
  })
  it('opens a launch-blocking Issue for a failed Production deploy', () => {
    const calls = run('Production', '')
    expect(calls).toMatch(/issue create .*bug · main fails to build on Vercel.*--label launch-blocking/s)
  })
  it('comments on the open Issue instead of opening a second', () => {
    const calls = run('Production', '42')
    expect(calls).toMatch(/issue comment 42/)
    expect(calls).not.toMatch(/issue create/)
  })
  it('ignores preview deploys', () => {
    expect(run('Preview', '')).toBe('')
  })
})
