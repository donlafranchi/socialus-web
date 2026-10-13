import { describe, it, expect } from 'vitest'
import { groupBySubject, orderSubjects, subjectTimeline } from './review-subjects'
import type { QueuedReport } from './reports-queue'

const report = (over: Partial<QueuedReport>): QueuedReport => ({
  reportId: 'r', body: 'x', category: 'other', reportedAt: new Date('2026-10-01T00:00:00Z'),
  hiddenAt: null, removedAt: null, groupId: 'g1', groupName: 'Bakery', groupSlug: 'b',
  photoUrl: null, ownerDisplayName: null, ownerHandle: null, history: [],
  subjectKind: 'group', subjectId: 'g1', ...over,
})

// F099 criterion 8 — reports on different images of one Page are different subjects.
describe('groupBySubject', () => {
  // [guards F099.8]
  it("keeps a Page's photo, its picture and one post's photo apart", () => {
    const subjects = groupBySubject([
      report({ reportId: 'a' }),
      report({ reportId: 'b', subjectKind: 'page_picture', subjectId: 'g1' }),
      report({ reportId: 'c', subjectKind: 'post_photo', subjectId: 'p1' }),
      report({ reportId: 'd', subjectKind: 'post_photo', subjectId: 'p1' }),
    ])
    expect(subjects).toHaveLength(3)
    expect(subjects.find((s) => s.subjectKind === 'post_photo')!.reports.map((r) => r.reportId)).toEqual(['c', 'd'])
  })

  it('leaves a Page-photo subject keyed by its Page, as before', () => {
    expect(groupBySubject([report({})])[0]!.subjectId).toBe('g1')
  })
})

// #626 — a "This is a mistake" claim puts the item at the top of the review list.
describe('orderSubjects — a mistake claim goes first', () => {
  const claim = { kind: 'mistake' as const, reason: null, note: null }
  const row = (id: string, over: Partial<QueuedReport>) =>
    report({ reportId: id, groupId: id, subjectId: id, hiddenAt: new Date('2026-10-02T00:00:00Z'), ...over })

  it('over a more severe, older hide', () => {
    const subjects = groupBySubject([
      row('urgent', { category: 'threat_of_harm', hiddenAt: new Date('2026-10-01T00:00:00Z') }),
      row('claimed', { category: 'spam', answer: claim }),
    ])
    expect(orderSubjects(subjects).map((s) => s.subjectId)).toEqual(['claimed', 'urgent'])
    expect(orderSubjects(subjects, 'age').map((s) => s.subjectId)).toEqual(['claimed', 'urgent'])
  })

  it('but never over a decided row', () => {
    const decided = { outcome: 'restored' as const, reasonCode: 'x', reasonNote: null, decidedAt: new Date(), decidedByName: null, reversesDecisionId: null, decidedByAi: false, alreadyReversed: false, decisionId: 'd' }
    const subjects = groupBySubject([row('waiting', {}), row('done', { answer: claim, history: [decided] })])
    expect(orderSubjects(subjects).map((s) => s.subjectId)).toEqual(['waiting', 'done'])
  })
})

// F101.12 (#634) — tapping a row opens the subject with its full history: every report, assessment, rebuttal and
// decision, newest first.
describe('subjectTimeline', () => {
  const at = (d: number, h = 0) => new Date(Date.UTC(2026, 9, d, h))
  const read = (day: number, outcome: 'approve' | 'remove', over: Record<string, unknown> = {}) =>
    ({ at: at(day), model: 'claude-haiku-4-5-20251001', outcome, severity: 2, confidence: 0.8, reason: `read ${day}`, skipped: null, ...over })
  const decision = (id: string, day: number, over: Record<string, unknown> = {}) => ({
    decisionId: id, outcome: 'removed' as const, reasonCode: 'not_suitable', reasonNote: null, decidedAt: at(day), decidedByName: 'Op',
    reversesDecisionId: null, alreadyReversed: false, decidedByAi: false, ...over,
  })

  // [guards F101.12 partial: the order, newest first; the detail that shows it is in ReviewQueue.test]
  it('lists every report, every AI read, the poster\'s answer and every decision, newest first', () => {
    const [s] = groupBySubject([
      report({ reportId: 'r1', reportedAt: at(1), assessments: [read(3, 'remove'), read(2, 'approve'), read(1, 'approve', { at: at(1, 5) })], history: [decision('d2', 6, { reversesDecisionId: 'd1', outcome: 'restored' }), decision('d1', 4)] }),
      report({ reportId: 'r2', reportedAt: at(5), answer: { kind: 'mistake', reason: null, note: null, at: at(5, 12) } }),
    ])
    const items = subjectTimeline(s!)
    expect(items.map((i) => `${i.kind}:${i.at.toISOString().slice(5, 13)}`)).toEqual([
      'decision:10-06T00',
      'rebuttal:10-05T12',
      'report:10-05T00',
      'decision:10-04T00',
      'assessment:10-03T00',
      'assessment:10-02T00',
      'assessment:10-01T05',
      'report:10-01T00',
    ])
  })

  it('every earlier AI read is there, not only the latest', () => {
    const [s] = groupBySubject([report({ reportId: 'r1', assessments: [read(3, 'remove'), read(2, 'approve'), read(1, 'approve')] })])
    expect(subjectTimeline(s!).filter((i) => i.kind === 'assessment')).toHaveLength(3)
  })

  it('an AI read that was skipped is a line too, saying why', () => {
    const [s] = groupBySubject([report({ assessments: [read(2, 'remove', { outcome: null, severity: null, confidence: null, reason: null, model: null, skipped: 'suspected severity 1' })] })])
    expect(subjectTimeline(s!).find((i) => i.kind === 'assessment')).toMatchObject({ skipped: 'suspected severity 1' })
  })

  it('a report, a read and a decision at the same moment keep a fixed order: the decision first', () => {
    const [s] = groupBySubject([report({ reportedAt: at(2), assessments: [read(2, 'approve')], history: [decision('d1', 2)] })])
    expect(subjectTimeline(s!).map((i) => i.kind)).toEqual(['decision', 'assessment', 'report'])
  })

  it('the poster\'s answer is one line however many reports carry it', () => {
    const answer = { kind: 'wrong' as const, reason: 'malicious' as const, note: 'x', at: at(3) }
    const [s] = groupBySubject([report({ reportId: 'r1', answer }), report({ reportId: 'r2', answer })])
    expect(subjectTimeline(s!).filter((i) => i.kind === 'rebuttal')).toHaveLength(1)
  })

  it('a subject with no reads, no answer and no decisions is just its reports', () => {
    const [s] = groupBySubject([report({ reportId: 'r1', reportedAt: at(1) }), report({ reportId: 'r2', reportedAt: at(2) })])
    expect(subjectTimeline(s!).map((i) => i.kind)).toEqual(['report', 'report'])
  })
})
