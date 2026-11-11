import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { enterStore } from '../scripts/knowledge/import'
import { classify, type GhSnapshot } from '../scripts/knowledge/live-state'
import {
  plain, firstSentence, render, renderPage, renderNext, pageBody, whoOf, builtText, whereText, nextText, MAX_LINES,
} from '@/lib/knowledge/answers'
import { runTool } from '@/lib/knowledge/tools'

// F131 (#1249): three short answers. The words and the GitHub classifier are
// pure and tested here first; then the three verbs, against a store holding a
// small made-up platform. The snapshot's own rules are SQL:
// supabase/tests/knowledge_live_state.sql.

const TICKET = /#\d+|\b(?:F\d{2,4}|T\d{2,4}|CO-\d{4}|CN-\d{4}|VN-\d{4}|CA-\d{4}|D-\d{4})\b/
const SOURCED = /\((?:store|GitHub|Vercel|both)\)$/

describe('plain words', () => {
  it('takes ticket numbers and title prefixes out', () => {
    expect(plain('F060 · T142 · Groups are groups')).toBe('Groups are groups')
    expect(plain('bug · live: the overnight smoke found a problem')).toBe('the overnight smoke found a problem')
    expect(plain('change · a new scenario can start its own concept (#1250)')).toBe('a new scenario can start its own concept')
    expect(plain('Finish F118-S2 for CO-0002, see PR #77.')).toBe('Finish for, see.')
    expect(plain('Set up Twilio')).toBe('Set up Twilio')
  })

  it('takes the point of a part from the first sentence of its why', () => {
    expect(firstSentence('A Page reaching its followers. It began as Bulletins.')).toBe('A Page reaching its followers.')
    expect(firstSentence('No full stop')).toBe('No full stop.')
    expect(firstSentence('  ')).toBeNull()
  })

  // [guards F131.1 partial: the three verbs' own lengths are checked against the store below]
  it('never shows more than ten lines, and says how many more', () => {
    const lines = Array.from({ length: 14 }, (_, i) => ({ text: `Line ${i + 1}.`, source: 'store' as const }))
    const out = render(lines).split('\n')
    expect(out).toHaveLength(MAX_LINES)
    expect(out[9]).toBe('- And 5 more (store)')
    expect(render(lines.slice(0, 10)).split('\n')).toHaveLength(10)
  })

  it('marks the PM as You and everyone else as Code', () => {
    expect(whoOf('the PM')).toBe('You')
    expect(whoOf('Don')).toBe('You')
    expect(whoOf('code')).toBe('Code')
    expect(whoOf(null)).toBe('Code')
  })
})

const issue = (number: number, title: string, labels: string[]) => ({
  number, title, html_url: `https://github.com/o/r/issues/${number}`, created_at: '2026-11-10T00:00:00Z', labels: labels.map((name) => ({ name })),
})
const pull = (number: number, title: string, labels: string[], draft = false) => ({ ...issue(number, title, labels), draft })

describe("reading GitHub's state", () => {
  const base: GhSnapshot = {
    issues: [
      issue(1, 'bug · main fails to build on Vercel', ['bug', 'launch-blocking']),
      issue(2, 'bug · live: the overnight smoke found a problem', ['bug']),
      issue(3, 'bug · live: taps are slower than budget', ['bug']),
      issue(4, 'bug · a typo on Explore', ['bug']),
      issue(5, 'F120 · Set up Twilio for the phone check', ['needs-pm']),
      issue(6, 'F118 · Reports go to a person', ['launch-blocking']),
      { ...issue(7, 'not an issue, a PR', ['bug']), pull_request: {} },
    ],
    pulls: [
      pull(10, 'F124 · the new map', ['human-review']),
      pull(11, 'F125 · versions', []),
      pull(12, 'wip', [], true),
    ],
    deploy: { state: 'failure', url: 'https://vercel.com/x', at: '2026-11-11T09:00:00Z' },
    failingChecks: [],
  }

  // [guards F131.5 partial: the job's run against GitHub itself, and its schedule, are .github/workflows/knowledge-answers.yml]
  it('sorts the alarms, blockers, waiting items and open work into their kinds', () => {
    const rows = classify(base)
    const kinds = rows.map((r) => `${r.kind} ${r.key} ${r.source}`)
    expect(kinds).toEqual([
      'broken issue:1 vercel',
      'blocker issue:1 github',
      'broken issue:2 github',
      'slow issue:3 github',
      'bug issue:4 github',
      'waiting issue:5 github',
      'blocker issue:6 github',
      'waiting pr:10 github',
      'in_flight pr:11 github',
    ])
  })

  it('reports a failed deploy and failing checks on main when no alarm has filed them', () => {
    const rows = classify({
      ...base,
      issues: [],
      failingChecks: [{ name: 'Unit tests', url: 'u1' }, { name: 'Browser', url: 'u2' }, { name: 'lint', url: 'u3' }, { name: 'build', url: 'u4' }],
    })
    expect(rows.filter((r) => r.kind === 'broken')).toEqual([
      expect.objectContaining({ key: 'deploy:production', source: 'vercel', words: 'the latest deploy to socialus.org failed' }),
      expect.objectContaining({ key: 'checks:main', words: 'checks failing on main: Unit tests, Browser, lint and 1 more' }),
    ])
    expect(classify({ ...base, issues: [], deploy: { state: 'success', url: null, at: 'x' } }).filter((r) => r.kind === 'broken')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// The three verbs, against the store.

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: "the three answers read the store and GitHub's snapshot in ten lines or fewer, each line sourced",
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

describe.skipIf(!RUNNABLE)('F131: the three answers, from the store', () => {
  let pool: Pool
  let db: PoolClient
  const rec = (r: Record<string, unknown>) =>
    db.query('select knowledge.record($1::jsonb, $2) as id', [JSON.stringify({ audience: 'department', departments: ['building'], ...r }), 'F131 test'])
      .then((x) => x.rows[0].id as string)
  const tool = async (name: string) => {
    const out = await runTool(db, name, {})
    expect(out.isError ?? false, out.text).toBe(false)
    return out.text
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    db = await pool.connect()
    await db.query('begin')
    await enterStore(db, 'answers-test')

    // Two built concepts with a point, one without (not shown), one cut.
    await rec({ kind: 'concept', status: 'built', answer: 'Posts with a time and a picture', why: 'What is happening near you today and this week. It began as Bulletins.' })
    await rec({ kind: 'concept', status: 'built', answer: 'Follow a Page or a person', why: 'Keep up without a feed choosing for you.' })
    await rec({ kind: 'concept', status: 'built', answer: 'A concept with no why' })
    await rec({ kind: 'concept', status: 'cut', answer: 'Bulletin intelligence', why: 'Cut for now.' })

    // The plan: a current version, a building slice, a Now slice that waits on Twilio, the top of Now.
    const twilio = await rec({ kind: 'condition', answer: 'Set up Twilio for the phone check', why: 'Posting without a Page needs a phone check.', owner: 'the PM' })
    await rec({ id: 'F990', kind: 'feature', answer: 'F990 · Start something without a shop', status: 'building' })
    await rec({ id: 'F991', kind: 'feature', answer: 'Post without a Page', status: 'approved' })
    await rec({ id: 'F992', kind: 'feature', answer: 'Every Page has a face', status: 'approved' })
    await db.query(`select knowledge.add_slice('F990', 'Start a Page with one question', 'now', 1, 'F131 test', '{}', 'building')`)
    await db.query(`select knowledge.add_slice('F991', 'Post as yourself', 'now', 2, 'F131 test', array[$1])`, [twilio])
    await db.query(`select knowledge.add_slice('F992', 'A picture on every Page', 'now', 3, 'F131 test')`)
    await db.query(`select knowledge.add_slice('F992', 'Pages pick their own colour', 'later', 1, 'F131 test')`)
    await db.query(
      `select knowledge.plan_version($1::jsonb, 'F131 test')`,
      [JSON.stringify({ answer: 'Beta, one area', why: 'One area first.', status: 'current', due_on: '2027-04-30', outcomes: ['Members post'], appetite: 'Six months',
                        includes: ['F990-S1', 'F991-S1', 'F992-S1'], leaves_out: [{ slice: 'F992-S2', reason: 'Later.' }] })],
    )

    // GitHub, as the job would leave it.
    const rows = classify({
      issues: [
        issue(1, 'bug · main fails to build on Vercel', ['bug']),
        issue(2, 'bug · live: the overnight smoke found a problem', ['bug']),
        issue(3, 'bug · live: taps are slower than budget', ['bug']),
        issue(4, 'bug · a typo on Explore', ['bug']),
        issue(5, 'F120 · Run the three-account report test', ['needs-pm']),
        issue(6, 'F118 · Reports go to a person', ['launch-blocking']),
      ],
      pulls: [pull(11, 'F125 · versions', [])],
      deploy: null,
      failingChecks: [],
    })
    await db.query('select knowledge.set_live_state($1::jsonb, $2)', [JSON.stringify(rows), '2026-11-11T12:00:00Z'])
  })

  afterAll(async () => {
    await db?.query('rollback')
    db?.release()
    await pool?.end()
  })

  const checkLines = (text: string) => {
    const lines = text.split('\n')
    expect(lines.length).toBeLessThanOrEqual(10)
    for (const l of lines) {
      expect(l, 'a ticket number or record id').not.toMatch(TICKET)
      expect(l, 'a line that names no source').toMatch(SOURCED)
    }
    return lines
  }

  // [guards F131.2]
  it('says what we built, one line per live area, each with its point', async () => {
    const lines = checkLines(await tool('built'))
    expect(lines).toContain('- Posts with a time and a picture. What is happening near you today and this week. (store)')
    expect(lines).toContain('- Follow a Page or a person. Keep up without a feed choosing for you. (store)')
    expect(lines.join('\n')).not.toContain('no why')
    expect(lines.join('\n')).not.toContain('Bulletin intelligence')
  })

  // [guards F131.3]
  it('says where we are: live, broken, slow, in flight, blockers, waiting on the PM', async () => {
    const lines = checkLines(await tool('where'))
    expect(lines).toEqual([
      '- Live: Beta, one area, until April 2027. (store)',
      '- Broken: main fails to build on Vercel; the overnight smoke found a problem. (both)',
      '- Slow: taps are slower than budget. (GitHub)',
      '- In flight: Start something without a shop; 1 change open. (both)',
      '- Before beta closes: 1 launch blocker, first Reports go to a person. (GitHub)',
      '- Waiting on you: Run the three-account report test. (GitHub)',
      '- Open bugs: 1. (GitHub)',
      '- GitHub read 2026-11-11 12:00 UTC. (store)',
    ])
  })

  // [guards F131.4]
  it("says what's next: at most five, broken first, then what unblocks others, then the top of Now", async () => {
    const lines = checkLines(await tool('next'))
    expect(lines).toEqual([
      '1. Fix: main fails to build on Vercel. Code. (Vercel)',
      '2. Fix: the overnight smoke found a problem. Code. (GitHub)',
      '3. Set up Twilio for the phone check; it unblocks Post without a Page. You. (store)',
      '4. Run the three-account report test. You. (GitHub)',
      '5. Finish: Start a Page with one question (Start something without a shop). Code. (store)',
    ])
  })

  // [guards F131.6]
  it('shows no line that nothing backs', async () => {
    // With GitHub's snapshot empty, nothing broken, slow or waiting is claimed.
    await db.query(`savepoint empty`)
    await db.query(`select knowledge.set_live_state('[]', '2026-11-12T12:00:00Z')`)
    const where = await whereText(db)
    expect(where).not.toMatch(/Broken|Slow|Waiting on you|launch blocker|Open bugs/)
    const next = await nextText(db)
    expect(next).not.toMatch(/Fix:/)
    expect(next.split('\n')[0]).toBe('1. Set up Twilio for the phone check; it unblocks Post without a Page. You. (store)')
    await db.query(`rollback to savepoint empty`)
  })

  // [guards F131.7]
  it('the phone page is the three answers, word for word', async () => {
    const a = { built: await builtText(db), where: await whereText(db), next: await nextText(db) }
    const page = renderPage(a, new Date('2026-11-11T12:30:00Z'))
    for (const name of ['built', 'where', 'next'] as const) expect(page).toContain(await tool(name))
    expect(page.split('\n').length).toBeLessThanOrEqual(45)
    expect(renderNext([])).toBe('')
    // A run that only read GitHub again at a later time is no change to send.
    const later = renderPage({ ...a, where: a.where.replace(/GitHub read .* UTC/, 'GitHub read 2026-11-12 12:00 UTC') }, new Date())
    expect(pageBody(later)).toBe(pageBody(page))
  })
})
