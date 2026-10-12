import { describe, it, expect } from 'vitest'
import { groupBySubject, orderSubjects } from './review-subjects'
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
