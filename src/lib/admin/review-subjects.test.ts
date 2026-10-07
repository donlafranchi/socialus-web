import { describe, it, expect } from 'vitest'
import { groupBySubject } from './review-subjects'
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
