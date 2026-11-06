// #1121 — the build alarm Issue stayed open five days after main built cleanly. A successful Production deploy closes it.
import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, mkdtempSync, chmodSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const wf = readFileSync('.github/workflows/main-build-recovered.yml', 'utf8')
const script = /run: \|\n([\s\S]+)$/.exec(wf)![1].replace(/^ {10}/gm, '')

function run(existing: string) {
  const dir = mkdtempSync(join(tmpdir(), 'recovered-'))
  const log = join(dir, 'calls')
  writeFileSync(join(dir, 'gh'), `#!/bin/bash\necho "$@" >> ${log}\n[ "$2" = list ] && echo "${existing}"\nexit 0\n`)
  chmodSync(join(dir, 'gh'), 0o755)
  execFileSync('bash', ['-c', script], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, REPO: 'o/r', SHA: 'afcb9110000', LOG: 'https://vercel.com/x' } })
  try { return readFileSync(log, 'utf8') } catch { return '' }
}

describe('main build recovered', () => {
  it('fires only on a successful Production deploy', () => {
    expect(wf).toMatch(/on:\n {2}deployment_status:/)
    expect(wf).toMatch(/state == 'success'/)
    expect(wf).toMatch(/startsWith\(github\.event\.deployment\.environment, 'Production'\)/)
  })
  it('closes the open alarm Issue with the deploy as evidence', () => {
    const calls = run('42')
    expect(calls).toMatch(/issue close 42 .*--reason completed .*afcb911/s)
  })
  it('does nothing when no alarm is open', () => {
    expect(run('')).not.toMatch(/issue close/)
  })
})
