// chore — the runners pull Supabase's images from a registry that rate-limits
// ("toomanyrequests: Rate exceeded"), which failed unrelated PRs three times in
// one evening. scripts/supabase-start.sh retries the start; CI uses it.

import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, chmodSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function fakeSupabase(failTimes: number) {
  const dir = mkdtempSync(join(tmpdir(), 'fake-supabase-'))
  const count = join(dir, 'count')
  writeFileSync(count, '0')
  writeFileSync(
    join(dir, 'supabase'),
    `#!/bin/bash
if [ "$1" = stop ]; then exit 0; fi
n=$(( $(cat ${count}) + 1 )); echo $n > ${count}
if [ $n -le ${failTimes} ]; then echo "Error response from daemon: toomanyrequests: Rate exceeded" >&2; exit 1; fi
exit 0
`,
  )
  chmodSync(join(dir, 'supabase'), 0o755)
  return { dir, tries: () => Number(readFileSync(count, 'utf8')) }
}

const run = (dir: string) =>
  spawnSync('bash', ['scripts/supabase-start.sh', '-x', 'studio'], {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, SUPABASE_START_ATTEMPTS: '3', SUPABASE_START_BACKOFF: '0' },
    encoding: 'utf8',
  })

describe('scripts/supabase-start.sh', () => {
  it('retries a start that hit the rate limit, then succeeds', () => {
    const f = fakeSupabase(2)
    expect(run(f.dir).status).toBe(0)
    expect(f.tries()).toBe(3)
  })
  it('gives up with the last failure after the attempts are used', () => {
    const f = fakeSupabase(99)
    const r = run(f.dir)
    expect(r.status).not.toBe(0)
    expect(f.tries()).toBe(3)
  })
  it('does not retry a start that worked', () => {
    const f = fakeSupabase(0)
    expect(run(f.dir).status).toBe(0)
    expect(f.tries()).toBe(1)
  })
})

describe('CI uses it', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8')
  it('starts the stack through the retrying script, everywhere', () => {
    expect(ci).not.toMatch(/\bsupabase start -x/)
    expect((ci.match(/scripts\/supabase-start\.sh/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })
})

