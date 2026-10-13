// #629 — standing guards for two F078 never-rules, each seen failing against a mutant (build-log/2026-W42/629-f078-guards.md).
// Source scans: absence of code proves nothing, so these name every place that could break the rule.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../../..')
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return f === 'node_modules' ? [] : sources(p)
    return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : []
  })
}
const SRC = sources(join(ROOT, 'src'))
const rel = (p: string) => p.slice(ROOT.length + 1)
const naming = (re: RegExp) => SRC.filter((p) => re.test(readFileSync(p, 'utf8'))).map(rel).sort()

describe('F078.3 — the poster is told in-app, never by email', () => {
  // [guards F078.3 partial: nothing in the code can email a member; that the notice is written in-app is the handler's check]
  it('the only code that sends email is the operator alert, and it writes only to the operator\'s own list', () => {
    expect(naming(/api\.resend\.com|resend\.com\/emails|nodemailer|sendgrid|sendMail|postmark/i)).toEqual(['src/lib/notify/operator-alert.ts'])
    const alert = readFileSync(join(ROOT, 'src/lib/notify/operator-alert.ts'), 'utf8')
    expect(alert).toMatch(/const to = \(env\.ADMIN_EMAILS \?\? ''\)/)
    // Nothing that reads a member's address is anywhere near it.
    expect(alert).not.toMatch(/members?\b.*email|auth\.users|from public\.members/i)
    // And the report path reaches it only to alert the operator, never with a member to write to.
    for (const f of naming(/notify\/operator-alert/).filter((p) => !p.includes('notify/'))) {
      expect(readFileSync(join(ROOT, f), 'utf8'), f).not.toMatch(/\.email\b|member_email|poster_email/)
    }
  })
})

describe('F078.4 — only an answer is the poster\'s to give, and nothing else adds to the staff queue', () => {
  // [guards F078.4 partial: the queue is the reports table; only a report adds to it. The scenario's "only an answer creates work" is superseded by #626, where a second report queues for staff]
  it('a report is the only thing that adds a row to the queue; a hide, a notice, an answer and a lapse do not', () => {
    expect(naming(/insert into public\.reports\b/)).toEqual(['src/actions/report/create.ts'])
    // Nothing puts a reviewed report back in the queue.
    expect(naming(/reviewed_at\s*=\s*null/i)).toEqual([])
    // The poster's answer writes the answer and nothing else.
    const answer = readFileSync(join(ROOT, 'src/actions/report/answer.ts'), 'utf8')
    expect([...answer.matchAll(/(insert into|update|delete from) public\.(\w+)/gi)].map((m) => m[2])).toEqual(['report_answers'])
    // The 14-day close is a read: a function over a row, with no database in it.
    const subjects = readFileSync(join(ROOT, 'src/lib/admin/review-subjects.ts'), 'utf8')
    expect(subjects).not.toMatch(/\.query\(|insert into|update public/i)
  })
})
