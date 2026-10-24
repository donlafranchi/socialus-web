import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

// #1005 — F078 criterion 1, whole: anything a member can post is reportable, and a submitted report triggers
// agent classification with the stated categories and a confidence/severity score. The real report.create and
// runAssessment run here with only the database stubbed.
//
// "Anything a member can post" is read from the code, not from a list kept here: every registered action is
// either a poster (and names the report kinds that reach what it posts) or says why it posts nothing. A new
// action in neither list fails, and so does a poster whose kind has no report path.

const { query, assessAfterReport } = vi.hoisted(() => ({ query: vi.fn(), assessAfterReport: vi.fn() }))
vi.mock('../_lib/db', () => ({ withTransaction: vi.fn(async (fn: (c: { query: typeof query }) => unknown) => fn({ query })) }))
vi.mock('../_lib/event-log', () => ({ appendEvent: vi.fn(async () => undefined) }))
vi.mock('@/lib/moderation/after-report', () => ({ assessAfterReport }))
vi.mock('@/lib/notify/operator-alert', () => ({ alertOperator: vi.fn(async () => undefined) }))

import { reportCreate, reportCreateInput } from './create'
import { listHandlers } from '@/actions'
import { runAssessment } from '@/lib/moderation/run-assessment'
import { ASSESS_CATEGORIES } from '@/lib/moderation/rules'
import { REPORT_CATEGORIES } from '@/lib/reports/categories'
import type { ActionContext } from '../_lib/context'
import type { Assessment, Read } from '@/lib/moderation/assess'

const ROOT = resolve(__dirname, '../../..')
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8')

type Kind = (typeof reportCreateInput.shape.subjectKind.options)[number]
const KINDS: readonly Kind[] = reportCreateInput.shape.subjectKind.options

// Every action that puts something a member wrote or uploaded in front of other members -> the report kinds
// that reach what it posts.
const POSTERS: Record<string, readonly Kind[]> = {
  'group.create': ['group', 'page_picture', 'page_words'],
  'group.update_draft': ['group', 'page_picture', 'page_words'],
  'group.update': ['group', 'page_picture', 'page_words'],
  'group.activate': ['group', 'page_picture', 'page_words'],
  'group.post_create': ['post', 'post_photo'],
  'group.post_edit': ['post', 'post_photo'],
  'item.featured_save': ['page_item'],
}

// Every other registered action, with why it posts nothing. [for now] where the reason can change.
const POSTS_NOTHING: Record<string, string> = {
  'member.create': 'creates the account',
  'member.business_jurisdiction.set': 'private setting',
  'member.business_jurisdiction.remove': 'private setting',
  'member.place_interest.add': 'private setting',
  'member.place_interest.remove': 'private setting',
  'member.default_metro.set': 'private setting',
  'member.signup_profile.set': 'private signup answers; F078 names photos, Pages, announcements and posts',
  'member.zip.set': 'private setting',
  'member.interests.add': 'private setting',
  'member.interests.remove': 'private setting',
  'member.follow': 'a relation, no words',
  'member.unfollow': 'a relation, no words',
  'member.notifications.set': 'private setting',
  'member.push.subscribe': 'private setting',
  'member.push.unsubscribe': 'private setting',
  'member.notifications.opened': 'private read receipt',
  'member.reminder.set': 'private reminder',
  'member.reminder.remove': 'private reminder',
  'member.reminder.every_for_page': 'private reminder',
  'member.saved_search.remove': 'private list',
  'member.saved_search.restore': 'private list',
  'member.search_sharing.set': 'private setting',
  'search.demand_log': 'anonymous count',
  'group.archive': 'lifecycle, no new content',
  'group.delete': 'lifecycle, no new content',
  'group.discard_draft': 'lifecycle, no new content',
  'group.restore': 'lifecycle, no new content',
  'group.market_stall.set': 'dates between two Pages, no words',
  'group.market_stall.skip': 'dates, no words',
  'group.market_stall.remove': 'removes',
  'group.market_stall.confirm': 'a confirmation, no words',
  'group.member_leave': 'a relation, no words',
  'group.member_join': 'a relation, no words',
  'group.follow': 'a relation, no words',
  'group.unfollow': 'a relation, no words',
  'group.post_delete': 'removes',
  'item.featured_remove': 'removes',
  // [for now] /you/sell redirects to Create since #336 and its flow is unrouted; the tripwire below fails if it is routed again.
  'item.create': 'unrouted since #336: no member surface reaches it',
  'item.publish': 'unrouted since #336: no member surface reaches it',
  'item.attach_location': 'unrouted since #336: no member surface reaches it',
  'report.create': 'is the report',
  'report.decide': 'operator only',
  'report.reverse': 'operator only',
  'report.answer': "the poster's reply, seen by the operator only",
  'report.purge_target': 'operator only',
  'report.purge': 'operator only',
  'report.ncmec_record': 'operator only',
  'problem.report': 'private to the operator',
  'tag.review': 'operator only',
  'origin.record': 'operator only',
  'metro.waitlist_join': 'private waitlist',
  'metro.waitlist_join_anonymous': 'private waitlist',
  'builder.content_set_visible': 'operator only',
  'builder.content_delete_all': 'operator only',
  'group.unclaimed_remove': 'removes',
  'group.unclaimed_restore': 'operator only',
  'group.claim_start': 'proof goes to the operator, not other members',
  'group.claim_verify': 'proof goes to the operator, not other members',
  'group.claim_proof': 'proof goes to the operator, not other members',
  'group.claim_decide': 'operator only',
}

// What the AI is shown for each kind: its words, its photo, or both (run-assessment's query).
const SHOWN: Record<Kind, { words: boolean; photo: boolean }> = {
  group: { words: true, photo: true },
  page_picture: { words: false, photo: true },
  page_words: { words: true, photo: false },
  post: { words: true, photo: false },
  post_photo: { words: true, photo: true },
  page_item: { words: true, photo: true },
}

const GROUP = '11111111-1111-1111-1111-111111111111'
const SUBJECT = '55555555-5555-5555-5555-555555555555'
const REPORTER = '22222222-2222-2222-2222-222222222222'
const FOUNDER = '44444444-4444-4444-4444-444444444444'
const REPORT = '33333333-3333-3333-3333-333333333333'
const NOW = new Date('2026-10-24T12:00:00Z')
const ctx = { actingMemberId: REPORTER, viaDelegationId: null, traceId: 't', db: {} as never, now: () => NOW } as ActionContext

// One row that satisfies every kind's subject query; the SQL decides which table it comes from.
const SUBJECT_ROW = {
  id: SUBJECT, group_id: GROUP, founder_member_id: FOUNDER, name: 'Oak Park Bakery', hide_bar: 0,
  builder_on_real: false, reporter_is_builder: false,
  photo_url: 'https://cdn.test/p.jpg', photo_hidden_at: null, photo_hide_locked_url: null,
  description: 'Bread.', words_hidden_at: null, words_hide_locked_text: null,
  title: 'Sourdough', hidden_at: null, hide_locked_text: null, body: 'Open Saturday.', hide_locked_body: null,
}

beforeEach(() => {
  query.mockReset()
  assessAfterReport.mockReset()
  query.mockImplementation(async (sql: string) => {
    if (/insert into public\.reports/i.test(sql)) return { rows: [{ id: REPORT }] }
    if (/count\(\*\)/i.test(sql)) return { rows: [{ count: '0' }] }
    if (/from public\.report_decisions/i.test(sql)) return { rows: [] }
    if (/^\s*select/i.test(sql) && /from public\.(groups|page_posts|items)/i.test(sql)) return { rows: [SUBJECT_ROW] }
    if (/^\s*(insert|update)/i.test(sql)) return { rows: [{ id: SUBJECT }] }
    throw new Error(`unexpected query in test: ${sql}`)
  })
})

const stored = () => (query.mock.calls as [string, unknown[]][]).filter(([s]) => /insert into public\.reports/i.test(s))

describe('F078 criterion 1 — everything a member can post is reportable and read by the AI', () => {
  // [guards F078.1]
  it('every kind a member can post has a report path, that report is stored and queued for the AI read, the read stores a category, severity and confidence, and no other kind is accepted', async () => {
    // 1. What a member can post comes from the code: every registered action is classified, nothing is left out.
    const handlers = listHandlers()
    const unclassified = handlers.filter((h) => !(h in POSTERS) && !(h in POSTS_NOTHING))
    expect(unclassified, `classify these actions in POSTERS (with their report kinds) or POSTS_NOTHING: ${unclassified.join(', ')}`).toEqual([])
    const stale = [...Object.keys(POSTERS), ...Object.keys(POSTS_NOTHING)].filter((h) => !handlers.includes(h))
    expect(stale, `no longer registered: ${stale.join(', ')}`).toEqual([])
    expect(Object.keys(POSTERS).filter((h) => h in POSTS_NOTHING)).toEqual([])

    // 2. Every postable thing reaches a report kind; every report kind is reached by something postable.
    const reachable = new Set(Object.values(POSTERS).flat())
    for (const [h, kinds] of Object.entries(POSTERS)) for (const k of kinds) expect(KINDS, `${h} posts ${k}, which report.create does not accept`).toContain(k)
    expect([...KINDS].filter((k) => !reachable.has(k))).toEqual([])
    // The scenario's four: photos, Pages, announcements, posts.
    expect(Object.keys(POSTERS)).toEqual(expect.arrayContaining(['group.create', 'group.post_create', 'item.featured_save']))
    expect(KINDS).toEqual(expect.arrayContaining(['group', 'page_picture', 'page_words', 'post', 'post_photo', 'page_item']))

    // 3. The database refuses a kind the code does not know, and accepts exactly these, on all three tables.
    const newestFirst = readdirSync(resolve(ROOT, 'supabase/migrations')).sort().reverse()
    for (const table of ['reports', 'member_notices', 'legal_holds']) {
      const latest = newestFirst.map((f) => read(`supabase/migrations/${f}`)).find((sql) => new RegExp(`add constraint ${table}_subject_kind_check`, 'i').test(sql))!
      const m = new RegExp(`add constraint ${table}_subject_kind_check[\\s\\S]*?check \\(subject_kind in \\(([^)]*)\\)\\)`, 'i').exec(latest)!
      const allowed = [...m[1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!).sort()
      expect(allowed, `${table}.subject_kind`).toEqual([...KINDS].sort())
    }

    // 4. The real handler stores a report for each kind, with each reason the reporter can pick, and queues the AI read.
    const categories = REPORT_CATEGORIES.map((c) => c.value)
    for (const subjectKind of KINDS) {
      for (const category of categories) {
        query.mockClear()
        assessAfterReport.mockClear()
        const r = await reportCreate(ctx, { subjectKind, category, subjectId: SUBJECT, body: 'Reported.' })
        expect(stored(), `${subjectKind}/${category}`).toHaveLength(1)
        expect(stored()[0]![1]).toEqual([REPORTER, subjectKind, SUBJECT, 'Reported.', category, NOW])
        expect(assessAfterReport, `${subjectKind}/${category}`).toHaveBeenCalledWith(r.reportId)
      }
    }
    await expect(reportCreate(ctx, { subjectKind: 'comment', category: 'spam', subjectId: SUBJECT, body: 'x' } as never)).rejects.toThrow()

    // 5. The read: the categories the criterion states, and for each kind a stored category, severity and confidence.
    //    (criterion's "children" is split into sensitive_child / sensitive_other since F080.)
    expect(ASSESS_CATEGORIES).toEqual(
      expect.arrayContaining(['harassment', 'nudity', 'spam', 'violence', 'sensitive_child', 'threat_of_harm', 'other']),
    )
    expect(categories).toEqual(expect.arrayContaining(['harassment', 'nudity', 'spam', 'violence', 'sensitive_content', 'threat_of_harm', 'other']))
    const aiRead: Read = {
      model: 'm', promptVersion: 'v', category: 'harassment', severity: 2, confidence: 0.83, outcome: 'remove',
      reason: 'r', latencyMs: 1, inputTokens: 1, outputTokens: 1,
    }
    const assess = vi.fn<() => Promise<Assessment | null>>(async () => ({ reads: [aiRead], shown: aiRead }))
    for (const subjectKind of KINDS) {
      const db = { query: vi.fn() }
      let selectSql = ''
      db.query.mockImplementation(async (sql: string) => {
        if (/from public\.reports/i.test(sql)) {
          selectSql = sql
          return { rows: [{ category: 'spam', subject_kind: subjectKind, name: 'Oak Park Bakery', content_text: 'Bread.', image_url: null, reporter_is_builder: false }] }
        }
        return { rows: [] }
      })
      assess.mockClear()
      await runAssessment(REPORT, db, { assess, fetchImage: async () => null })
      // The AI is shown what was reported: the query must read this kind's words or photo.
      const wants = SHOWN[subjectKind]
      const cases = selectSql.match(new RegExp(`when '${subjectKind}' then`, 'g'))?.length ?? 0
      expect(cases, `the AI read shows nothing of ${subjectKind}`).toBe(Number(wants.words) + Number(wants.photo))
      expect(selectSql, `the AI read does not join ${subjectKind}`).toMatch(new RegExp(`left join[^\\n]*'${subjectKind}'`))
      expect(assess).toHaveBeenCalledTimes(1)
      const inserts = (db.query.mock.calls as [string, unknown[]][]).filter(([s]) => /insert into public\.report_assessments/i.test(s))
      expect(inserts, subjectKind).toHaveLength(1)
      expect(inserts[0]![1]).toEqual(expect.arrayContaining([REPORT, 'harassment', 2, 0.83]))
    }

    // 6. Tripwire for the one flow that could post without a report path: listings are unrouted (#336).
    expect(read('src/app/you/sell/page.tsx')).toMatch(/redirect\(/)
  })
})
