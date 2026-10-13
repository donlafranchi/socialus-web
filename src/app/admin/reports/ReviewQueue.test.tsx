// F101 / #304 — the review page: one row per subject, one tap or swipe, a
// five-second Undo that writes nothing.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ReviewQueue } from './ReviewQueue'
import { groupBySubject, orderSubjects, type ReviewSubject } from '@/lib/admin/review-subjects'
import type { QueuedReport, PastDecision } from '@/lib/admin/reports-queue'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const day = (n: number) => new Date(Date.UTC(2026, 9, n))
const report = (id: string, groupId: string, over: Partial<QueuedReport> = {}): QueuedReport => ({
  reportId: id,
  body: `Report ${id}`,
  category: null,
  reportedAt: day(3),
  hiddenAt: day(3),
  removedAt: null,
  subjectKind: 'group',
  subjectId: groupId,
  groupId,
  groupName: `Page ${groupId}`,
  groupSlug: groupId,
  photoUrl: `https://example.test/${groupId}.webp`,
  ownerDisplayName: null,
  ownerHandle: null,
  history: [],
  ...over,
})
const decided: PastDecision = {
  decisionId: 'd1',
  outcome: 'removed',
  reasonCode: 'not_suitable',
  reasonNote: null,
  decidedAt: day(4),
  decidedByName: 'Op',
  reversesDecisionId: null,
  alreadyReversed: false,
  decidedByAi: false,
}

const onDecide = vi.fn(async () => {})
const onReverse = vi.fn(async () => {})
const show = (subjects: ReviewSubject[], summary?: { answers: number; coolDowns: number }) =>
  render(<ReviewQueue subjects={subjects} onDecide={onDecide} onReverse={onReverse} summary={summary} />)

beforeEach(() => {
  vi.useFakeTimers()
  onDecide.mockClear()
  onReverse.mockClear()
  refresh.mockClear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('F101 — one row per subject', () => {
  it('rolls a subject’s reports into one row and counts only undecided ones as open', () => {
    const subjects = groupBySubject([report('r1', 'a'), report('r2', 'a'), report('r3', 'b', { history: [decided] })])
    expect(subjects).toHaveLength(2)
    expect(subjects.find((s) => s.subjectId === 'a')!.openReportIds).toEqual(['r1', 'r2'])
    expect(subjects.find((s) => s.subjectId === 'b')!.openReportIds).toEqual([])
  })

  it('orders waiting rows first, then severity, then oldest hidden', () => {
    const subjects = groupBySubject([
      report('r1', 'new', { hiddenAt: day(5) }),
      report('r2', 'old', { hiddenAt: day(1) }),
      report('r3', 'done', { hiddenAt: day(1), history: [decided] }),
    ])
    subjects.find((s) => s.subjectId === 'new')!.severity = 1
    expect(orderSubjects(subjects).map((s) => s.subjectId)).toEqual(['new', 'old', 'done'])
    expect(orderSubjects(subjects, 'age').map((s) => s.subjectId)).toEqual(['old', 'new', 'done'])
  })
})

describe('F101 — one tap, then a five-second Undo', () => {
  const two = () => groupBySubject([report('r1', 'a'), report('r2', 'a'), report('r3', 'b')])

  it('Approve takes the row away and decides every open report after five seconds, with the default reason', async () => {
    show(two())
    fireEvent.click(screen.getAllByTestId('review-approve')[0]!)
    expect(screen.getAllByTestId('review-row')).toHaveLength(1)
    expect(onDecide).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(onDecide).toHaveBeenCalledTimes(2)
    expect(onDecide).toHaveBeenCalledWith({ reportId: 'r1', outcome: 'restored', reasonCode: 'nothing_wrong' })
    expect(onDecide).toHaveBeenCalledWith({ reportId: 'r2', outcome: 'restored', reasonCode: 'nothing_wrong' })
  })

  it('Undo brings the row back and writes nothing', async () => {
    show(two())
    fireEvent.click(screen.getAllByTestId('review-remove')[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await act(async () => {
      vi.advanceTimersByTime(6000)
    })
    expect(onDecide).not.toHaveBeenCalled()
    expect(screen.getAllByTestId('review-row')).toHaveLength(2)
  })

  it('a second decision sends the first at once', async () => {
    show(two())
    fireEvent.click(screen.getAllByTestId('review-remove')[0]!)
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('review-remove')[0]!)
    })
    expect(onDecide).toHaveBeenCalledWith(expect.objectContaining({ reportId: 'r1', outcome: 'removed', reasonCode: 'not_suitable' }))
  })

  it('severity 1 asks once more before Approve', () => {
    const s = two()
    s[0]!.severity = 1
    show(s)
    fireEvent.click(screen.getAllByTestId('review-approve')[0]!)
    expect(screen.getByTestId('review-confirm')).toBeInTheDocument()
    expect(screen.getAllByTestId('review-row')).toHaveLength(2)
  })

  it('a swipe right approves, past the threshold only', () => {
    show(two())
    const card = screen.getAllByTestId('review-row')[0]!.querySelector('.touch-pan-y')!
    fireEvent.pointerDown(card, { clientX: 10 })
    fireEvent.pointerMove(card, { clientX: 60 })
    fireEvent.pointerUp(card)
    expect(screen.getAllByTestId('review-row')).toHaveLength(2)
    fireEvent.pointerDown(card, { clientX: 10 })
    fireEvent.pointerMove(card, { clientX: 140 })
    fireEvent.pointerUp(card)
    expect(screen.getAllByTestId('review-row')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('Approved')
  })

  it('R removes the focused row from the keyboard, and U undoes', () => {
    show(two())
    const list = screen.getByTestId('review-rows')
    fireEvent.keyDown(screen.getAllByTestId('review-approve')[0]!, { key: 'r' })
    expect(screen.getAllByTestId('review-row')).toHaveLength(1)
    fireEvent.keyDown(list, { key: 'u' })
    expect(screen.getAllByTestId('review-row')).toHaveLength(2)
  })

  // #398 — WCAG 2.1.4: single-key shortcuts only while focus is in the list.
  it('a key pressed outside the list decides nothing', () => {
    show(two())
    fireEvent.keyDown(window, { key: 'r' })
    fireEvent.keyDown(document.body, { key: 'a' })
    expect(screen.getAllByTestId('review-row')).toHaveLength(2)
  })

  // #398 — WCAG 2.2.1: the Undo waits while someone is on it.
  it('the Undo toast waits while it is hovered or focused', async () => {
    show(two())
    fireEvent.click(screen.getAllByTestId('review-remove')[0]!)
    fireEvent.mouseEnter(screen.getByTestId('toast'))
    await act(async () => {
      vi.advanceTimersByTime(10_000)
    })
    expect(onDecide).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getAllByTestId('review-row')).toHaveLength(2)
  })

  it('the row in hand is marked, not by colour alone', () => {
    show(two())
    expect(screen.getAllByTestId('review-row')[0]).toHaveAttribute('aria-current', 'true')
  })

  // F101.13 (#635): severities 1–3 are blurred until pressed and held; 4 shows plain.
  const thumbOf = (id: string) => document.querySelector(`[data-subject="${id}"] [data-testid="review-thumb"]`) as HTMLElement

  // [guards F101.13]
  it('a severity 1 to 3 photo is blurred, shown only while pressed and held, and blurred again on release; severity 4 is plain', () => {
    const s = two()
    s[1]!.severity = 4
    show(s)
    const [first, second] = [thumbOf('a'), thumbOf('b')]
    expect(first).toHaveAttribute('data-blurred', 'true')
    fireEvent.pointerDown(first)
    expect(first).toHaveAttribute('data-blurred', 'false')
    fireEvent.pointerUp(first)
    expect(first).toHaveAttribute('data-blurred', 'true')
    fireEvent.pointerDown(first)
    fireEvent.pointerLeave(first)
    expect(first).toHaveAttribute('data-blurred', 'true')
    fireEvent.pointerDown(first)
    fireEvent.pointerCancel(first)
    expect(first).toHaveAttribute('data-blurred', 'true')
    expect(second).toHaveAttribute('data-blurred', 'false')
  })

  it('a tap that lifts again does not leave the photo showing', () => {
    show(two())
    const t = thumbOf('a')
    fireEvent.pointerDown(t)
    fireEvent.pointerUp(t)
    fireEvent.click(t, { detail: 1 })
    expect(t).toHaveAttribute('data-blurred', 'true')
  })

  it('a hold on the photo does not start the row\'s swipe, and a long press raises no menu', () => {
    show(two())
    const t = thumbOf('a')
    fireEvent.pointerDown(t, { clientX: 10 })
    fireEvent.pointerMove(t, { clientX: 200 })
    fireEvent.pointerUp(t, { clientX: 200 })
    expect(onDecide).not.toHaveBeenCalled()
    expect(fireEvent.contextMenu(t)).toBe(false)
  })

  // WCAG 2.1.1 (#398): the same hold from a keyboard, and the assistive-technology click.
  it('is reachable from the keyboard: shown while Space or Enter is held, and a screen reader\'s click toggles it', () => {
    show(two())
    const t = thumbOf('a')
    fireEvent.keyDown(t, { key: ' ' })
    expect(t).toHaveAttribute('data-blurred', 'false')
    fireEvent.keyUp(t, { key: ' ' })
    expect(t).toHaveAttribute('data-blurred', 'true')
    fireEvent.keyDown(t, { key: 'Enter' })
    expect(t).toHaveAttribute('data-blurred', 'false')
    fireEvent.blur(t)
    expect(t).toHaveAttribute('data-blurred', 'true')
    fireEvent.click(t, { detail: 0 })
    expect(t).toHaveAttribute('data-blurred', 'false')
    fireEvent.click(t, { detail: 0 })
    expect(t).toHaveAttribute('data-blurred', 'true')
    expect(t).toHaveAccessibleName(/hold to show the photo/i)

  it('a decided report no longer counts toward severity', () => {
    const subjects = groupBySubject([post('r1', 'p1', { category: 'sensitive_content', history: [decided] }), post('r2', 'p1', { category: 'spam' })])
    expect(subjects[0]!.severity).toBe(4)
  })

  it('no reasons given means no severity, as before', () => {
    expect(groupBySubject([report('r1', 'a')])[0]!.severity).toBeNull()
  })

  it('shows the severity badge and the reasons with counts', () => {
    show(groupBySubject([post('r1', 'p1', { category: 'harassment' }), post('r2', 'p1', { category: 'harassment' }), post('r3', 'p1', { category: 'spam' })]))
    expect(screen.getByTestId('review-severity')).toHaveTextContent('Severity 2')
    expect(screen.getByTestId('review-reasons')).toHaveTextContent('Harassment ×2')
    expect(screen.getByTestId('review-reasons')).toHaveTextContent('Spam')
  })

  it('the excerpt is the content that was reported, not the reporter\'s words', () => {
    show(groupBySubject([post('r1', 'p1', { body: 'reporter wrote this', contentText: 'x'.repeat(200) })]))
    const text = screen.getByTestId('review-excerpt').textContent!
    expect(text).not.toContain('reporter wrote')
    expect(text.length).toBeLessThanOrEqual(120)
  })

  it('deciding on a Post row decides its open report ids', async () => {
    show(groupBySubject([post('r1', 'p1', { category: 'spam' }), post('r2', 'p1', { category: 'spam' })]))
    fireEvent.click(screen.getByTestId('review-remove'))
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(onDecide).toHaveBeenCalledTimes(2)
  })
})

describe('F101 — the two buttons are 48px tall', () => {
  // [guards F101.5 partial: the height; jsdom has no layout, so this is the class that wins over min-h-tap]
  it('Approve and Remove force min-h-12 over the button\'s own 44px floor', () => {
    show(groupBySubject([report('r1', 'a')]))
    for (const id of ['review-approve', 'review-remove']) expect(screen.getByTestId(id).className).toContain('min-h-12!')
  })
})

describe('F099 — the row names the image', () => {
  it('says Page photo, Page picture or Post photo by what was reported', () => {
    show(
      groupBySubject([
        report('r1', 'a'),
        report('r2', 'b', { subjectKind: 'page_picture' }),
        report('r3', 'c', { subjectKind: 'post_photo', subjectId: 'p1' }),
      ]),
    )
    expect(screen.getAllByTestId('review-kind').map((e) => e.textContent).sort()).toEqual(['Page photo', 'Page picture', 'Post photo'])
  })
})

describe('F102 criterion 8 — coordinated reporting is flagged, not acted on', () => {
  const at = (h: number) => new Date(Date.UTC(2026, 9, 3, h))
  const r = (id: string, over: Partial<QueuedReport> = {}) =>
    report(id, 'page-1', { posterId: 'poster-1', reporterAgeDays: 400, reportedAt: at(1), ...over })

  // [guards F102.8]
  it('three reports in a day, two from accounts under a week old, mark the row', () => {
    const s = groupBySubject([r('a', { reporterAgeDays: 1 }), r('b', { reporterAgeDays: 2, reportedAt: at(5) }), r('c', { reportedAt: at(9) })])
    expect(s[0]!.coordinated).toBe(true)
  })

  it('not with only one new account', () => {
    expect(groupBySubject([r('a', { reporterAgeDays: 1 }), r('b', { reportedAt: at(5) }), r('c', { reportedAt: at(9) })])[0]!.coordinated).toBe(false)
  })

  it('not when the three are spread over more than 24 hours', () => {
    const s = groupBySubject([r('a', { reporterAgeDays: 1 }), r('b', { reporterAgeDays: 2, reportedAt: at(30) }), r('c', { reportedAt: at(60) })])
    expect(s[0]!.coordinated).toBe(false)
  })

  it('counts one poster\'s reports across their Page and their post together', () => {
    const s = groupBySubject([
      r('a', { reporterAgeDays: 1 }),
      r('b', { reporterAgeDays: 2, reportedAt: at(5), subjectKind: 'post', postId: 'p1' }),
      r('c', { reportedAt: at(9), subjectKind: 'post', postId: 'p1' }),
    ])
    expect(s.every((x) => x.coordinated)).toBe(true)
  })

  it('adds one tier of priority within a severity, and says so on the row', () => {
    const base = [r('a', { category: 'spam' })]
    const flagged = [
      report('x', 'page-2', { posterId: 'poster-2', category: 'spam', reporterAgeDays: 1, reportedAt: at(1), hiddenAt: day(9) }),
      report('y', 'page-2', { posterId: 'poster-2', category: 'spam', reporterAgeDays: 1, reportedAt: at(2), hiddenAt: day(9) }),
      report('z', 'page-2', { posterId: 'poster-2', category: 'spam', reporterAgeDays: 400, reportedAt: at(3), hiddenAt: day(9) }),
    ]
    const subjects = groupBySubject([...base, ...flagged])
    expect(orderSubjects(subjects)[0]!.subjectId).toBe('page-2')
    show(subjects)
    expect(screen.getAllByTestId('review-coordinated')).toHaveLength(1)
    expect(screen.getByTestId('review-coordinated')).toHaveTextContent(/possible coordinated reporting/i)
  })
})

describe('F101 criterion 2 / F102 — the poster\'s answer is on the row', () => {
  it('shows what the poster said, so the operator decides with both sides', () => {
    show(groupBySubject([report('r1', 'a', { answer: { kind: 'wrong', reason: 'malicious', note: 'He reports everything I post.' } })]))
    expect(screen.getByTestId('review-answer')).toHaveTextContent('Poster: Malicious')
    expect(screen.getByTestId('review-answer')).toHaveTextContent('He reports everything I post.')
  })

  it('says when the poster fixed it and reposted', () => {
    show(groupBySubject([report('r1', 'a', { answer: { kind: 'fix_and_repost', reason: null, note: null } })]))
    expect(screen.getByTestId('review-answer')).toHaveTextContent(/fixed it and reposted/i)
  })

  it('says nothing when there is no answer', () => {
    show(groupBySubject([report('r1', 'a')]))
    expect(screen.queryByTestId('review-answer')).toBeNull()
  })
})

describe('F102 criterion 11 — the Friday summary', () => {
  // Friday 2026-10-16, 9am in Sacramento; Wednesday 2026-10-14.
  const FRIDAY = new Date('2026-10-16T16:00:00Z')
  const WEDNESDAY = new Date('2026-10-14T16:00:00Z')
  const week = [report('r1', 'a', { category: 'sensitive_content', hiddenAt: new Date('2026-10-15T00:00:00Z') }), report('r2', 'b', { category: 'harassment', hiddenAt: new Date('2026-10-15T00:00:00Z') }), report('r3', 'c', { category: 'spam', hiddenAt: new Date('2026-10-15T00:00:00Z') })]

  // [guards F102.11]
  it('on Friday morning says what is waiting by severity, how many answers came in, and how many reporters are cooling down', () => {
    vi.setSystemTime(FRIDAY)
    show(groupBySubject(week), { answers: 3, coolDowns: 1 })
    expect(screen.getByTestId('review-summary')).toHaveTextContent('This week: 3 waiting (1 severity 1, 1 severity 2, 1 severity 4) · 3 answers from posters · 1 reporter cooling down')
  })

  it('is plain when there is nothing to say', () => {
    vi.setSystemTime(FRIDAY)
    show([], { answers: 0, coolDowns: 0 })
    expect(screen.getByTestId('review-summary')).toHaveTextContent('This week: nothing waiting · no answers from posters · no cool-downs')
  })

  it('is one summary on Friday and nothing asking for attention on any other weekday', () => {
    for (const d of ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-17', '2026-10-18']) {
      vi.setSystemTime(new Date(`${d}T16:00:00Z`))
      show(groupBySubject(week), { answers: 3, coolDowns: 1 })
      expect(screen.queryByTestId('review-summary'), d).toBeNull()
      cleanup()
    }
  })

  it('is absent when no summary is given', () => {
    vi.setSystemTime(FRIDAY)
    show(groupBySubject(week))
    expect(screen.queryByTestId('review-summary')).toBeNull()
  })

  it('midweek the page still shows severity 1 waiting, the one thing that asks for attention', () => {
    vi.setSystemTime(WEDNESDAY)
    show(groupBySubject(week), { answers: 3, coolDowns: 1 })
    expect(screen.getByTestId('review-waiting')).toHaveTextContent('1 severity 1')
  })
})

describe('F102 criterion 4 — a lapsed unanswered hide leaves the batch unless it is severity 1', () => {
  const hidden = (id: string, category: QueuedReport['category'], daysAgo: number, over: Partial<QueuedReport> = {}) =>
    report(id, id, { category, hiddenAt: new Date(Date.UTC(2026, 9, 20, 16) - daysAgo * 86_400_000), ...over })
  beforeEach(() => vi.setSystemTime(new Date('2026-10-20T16:00:00Z')))

  // [guards F102.4]
  it('after 14 days with no answer a severity 2 to 4 row leaves the batch and stays hidden; severity 1, an answered row and a younger one stay', () => {
    show(
      groupBySubject([
        hidden('lapsed-spam', 'spam', 15),
        hidden('lapsed-harass', 'harassment', 20),
        hidden('lapsed-child', 'sensitive_content', 30),
        hidden('answered', 'spam', 20, { answer: { kind: 'mistake', reason: null, note: null } }),
        hidden('young', 'spam', 13),
      ]),
    )
    expect(screen.getAllByTestId('review-row').map((r) => r.getAttribute('data-subject')).sort()).toEqual(['answered', 'lapsed-child', 'young'])
    expect(screen.getByTestId('review-waiting')).toHaveTextContent('3 waiting')
    // It closed itself: nothing was decided, and it is still hidden, one filter away.
    expect(onDecide).not.toHaveBeenCalled()
    fireEvent.change(screen.getByTestId('review-filter'), { target: { value: 'all' } })
    expect(screen.getAllByTestId('review-row')).toHaveLength(5)
  })

  it('exactly 14 days is the window: a day short stays, the 14th day lapses', () => {
    show(groupBySubject([hidden('d13', 'spam', 13.9), hidden('d14', 'spam', 14)]))
    expect(screen.getAllByTestId('review-row').map((r) => r.getAttribute('data-subject'))).toEqual(['d13'])
  })
})

describe('F101 criterion 10 — one tap removes with the reason that matches the row', () => {
  const rep = (id: string, category: QueuedReport['category']) => report(id, 'a', { category })

  it('Remove records the reason for the row\'s top category, not a generic one', async () => {
    show(groupBySubject([rep('r1', 'harassment'), rep('r2', 'harassment'), rep('r3', 'spam')]))
    fireEvent.click(screen.getByTestId('review-remove'))
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(onDecide).toHaveBeenCalledWith({ reportId: 'r1', outcome: 'removed', reasonCode: 'harassment' })
  })

  it('a tie goes to the more serious category', () => {
    const s = groupBySubject([rep('r1', 'spam'), rep('r2', 'threat_of_harm')])[0]!
    expect(s.removeReason).toBe('threat_of_harm')
  })

  it('no reason given falls back to "not suitable"', () => {
    expect(groupBySubject([report('r1', 'a')])[0]!.removeReason).toBe('not_suitable')
  })
})

describe('F100 / F101 — the AI\'s read is on the row', () => {
  const ai = { category: 'harassment', severity: 2, confidence: 0.91, outcome: 'remove' as const, reason: 'Insults a neighbour.' }

  it('shows the suggestion and confidence, and its own severity beside the reporter\'s in shadow mode', () => {
    show(groupBySubject([report('r1', 'a', { category: 'spam', ai })]))
    expect(screen.getByTestId('review-ai')).toHaveTextContent('AI: remove · 0.91')
    expect(screen.getByTestId('review-ai')).toHaveTextContent('Insults a neighbour.')
    expect(screen.getByTestId('review-severity')).toHaveTextContent('Severity 4')
    expect(screen.getByTestId('review-ai')).toHaveTextContent('AI severity 2')
  })

  // [guards F101.3]
  it('in shadow mode only the reporter\'s reason sets the tier', () => {
    expect(groupBySubject([report('r1', 'a', { category: 'spam', ai })])[0]!.severity).toBe(4)
  })

  it('in live mode the higher of the two sets it', () => {
    expect(groupBySubject([report('r1', 'a', { category: 'spam', ai })], { live: true })[0]!.severity).toBe(2)
    expect(groupBySubject([report('r1', 'a', { category: 'harassment', ai: { ...ai, severity: 4 } })], { live: true })[0]!.severity).toBe(2)
  })

  it('a row the AI has not read says nothing of the kind', () => {
    show(groupBySubject([report('r1', 'a', { category: 'spam' })]))
    expect(screen.queryByTestId('review-ai')).toBeNull()
  })

  it('a row the AI skipped for suspected severity 1 says a person must look', () => {
    show(groupBySubject([report('r1', 'a', { category: 'sensitive_content', ai: { skipped: 'suspected severity 1: not sent to an AI provider (F100 criterion 12)' } })]))
    expect(screen.getByTestId('review-ai')).toHaveTextContent(/not read by the AI/i)
  })
})

describe('F101 criterion 15 — a batch of 50 is a batch of 50 single actions', () => {
  // [guards F101.15 partial: the steps, not the minutes; the 375px browser timing is not measured here]
  it('clears 50 waiting rows with one keystroke each, the next row moving into place every time', async () => {
    const rows = Array.from({ length: 50 }, (_, i) => report(`r${i}`, `g${i}`, { category: 'spam' }))
    show(groupBySubject(rows))
    const list = screen.getByTestId('review-rows')
    for (let i = 0; i < 50; i++) {
      expect(screen.getAllByTestId('review-row')).toHaveLength(50 - i)
      await act(async () => {
        fireEvent.keyDown(list.querySelector('[data-testid="review-approve"]')!, { key: 'a' })
      })
    }
    await act(async () => {
      vi.advanceTimersByTime(6000)
    })
    expect(onDecide).toHaveBeenCalledTimes(50)
    expect(screen.queryAllByTestId('review-row')).toHaveLength(0)
  }, 30_000)
})

// F102 criterion 12 — a restore the AI made shows as its own state, with a one-tap confirm or undo.
describe('F102.12 — Restored by AI', () => {
  const byAi: PastDecision = { ...decided, decisionId: 'ai1', outcome: 'restored', reasonCode: 'nothing_wrong', decidedByName: null, decidedByAi: true }
  const aiRow = () => groupBySubject([report('r1', 'a', { category: 'spam', history: [byAi] })])

  it('a subject whose latest decision is the AI\'s restore is marked, and one a person decided is not', () => {
    expect(aiRow()[0]!.aiRestored).toEqual([{ reportId: 'r1', decisionId: 'ai1' }])
    expect(groupBySubject([report('r1', 'a', { history: [decided] })])[0]!.aiRestored).toEqual([])
    // A person's later confirm (newest first) clears it; so does an undo.
    const confirmed: PastDecision = { ...decided, decisionId: 'p1', outcome: 'restored', decidedByAi: false }
    expect(groupBySubject([report('r1', 'a', { history: [confirmed, byAi] })])[0]!.aiRestored).toEqual([])
    expect(groupBySubject([report('r1', 'a', { history: [{ ...byAi, alreadyReversed: true }] })])[0]!.aiRestored).toEqual([])
  })

  it('shows "Restored by AI" in the default list with Confirm and Undo, and no Approve or Remove', () => {
    show(aiRow())
    expect(screen.getByTestId('review-ai-restored')).toHaveTextContent('Restored by AI')
    expect(screen.getByTestId('review-ai-confirm')).toBeInTheDocument()
    expect(screen.getByTestId('review-ai-undo')).toBeInTheDocument()
    expect(screen.queryByTestId('review-approve')).toBeNull()
  })

  it('Confirm records the operator\'s own approval, with no five-second wait', async () => {
    show(aiRow())
    await act(async () => {
      fireEvent.click(screen.getByTestId('review-ai-confirm'))
    })
    expect(onDecide).toHaveBeenCalledWith({ reportId: 'r1', outcome: 'restored', reasonCode: 'nothing_wrong' })
    expect(onReverse).not.toHaveBeenCalled()
  })

  it('Undo reverses the AI\'s decision, which puts the content back down', async () => {
    show(aiRow())
    await act(async () => {
      fireEvent.click(screen.getByTestId('review-ai-undo'))
    })
    expect(onReverse).toHaveBeenCalledWith({ decisionId: 'ai1', reasonCode: 'spam' })
    expect(onDecide).not.toHaveBeenCalled()
  })

  it('a row with no AI restore shows neither', () => {
    show(groupBySubject([report('r1', 'a')]))
    expect(screen.queryByTestId('review-ai-restored')).toBeNull()
  })

  it('the history names the AI as the one who decided', () => {
    show(aiRow())
    fireEvent.click(screen.getByTestId('review-details'))
    expect(screen.getByTestId('review-detail')).toHaveTextContent('AI')
    expect(screen.getByTestId('review-detail')).not.toHaveTextContent('unknown')
  })
})

// F101.12 (#634) — the detail lists the subject's whole history, newest first, with Undo on any decision.
describe('F101 criterion 12 — the detail shows the full history', () => {
  const read = (d: number, outcome: 'approve' | 'remove', reason: string) => ({ at: day(d), model: 'claude-haiku-4-5-20251001', outcome, severity: 2, confidence: 0.8, reason, skipped: null })
  const open = (subjects: ReviewSubject[]) => {
    show(subjects)
    fireEvent.click(screen.getByTestId('review-details'))
  }

  // [guards F101.12]
  it('lists every earlier AI read, not only the latest, with the reports, the answer and the decisions, newest first, and Undo on a decision', () => {
    open(
      groupBySubject([
        report('r1', 'a', {
          reportedAt: day(1),
          assessments: [read(5, 'remove', 'Third read.'), read(3, 'approve', 'Second read.'), read(2, 'approve', 'First read.')],
          history: [{ ...decided, decidedAt: day(6) }],
          answer: { kind: 'wrong', reason: 'malicious', note: 'He reports everything.', at: day(4) },
        }),
        // A second, undecided report keeps the subject in the waiting list.
        report('r2', 'a', { reportedAt: day(1) }),
      ]),
    )
    const lines = screen.getAllByTestId('timeline-item').map((li) => li.getAttribute('data-kind'))
    expect(lines).toEqual(['decision', 'assessment', 'rebuttal', 'assessment', 'assessment', 'report', 'report'])
    const text = screen.getByTestId('subject-timeline').textContent!
    expect(text.indexOf('Third read.')).toBeLessThan(text.indexOf('Second read.'))
    expect(text.indexOf('Second read.')).toBeLessThan(text.indexOf('First read.'))
    expect(text).toContain('He reports everything.')
    expect(screen.getByTestId('reverse-d1')).toBeInTheDocument()
  })

  it('says who and what for each line: the model and its call, the reporter\'s words, the decision and who made it', () => {
    open(groupBySubject([report('r1', 'a', { category: 'spam', body: 'Looks like an ad.', assessments: [read(3, 'remove', 'Promotion.')], history: [decided] }), report('r2', 'a')]))
    const t = screen.getByTestId('subject-timeline').textContent!
    expect(t).toMatch(/AI read: remove/)
    expect(t).toContain('Promotion.')
    expect(t).toContain('Looks like an ad.')
    expect(t).toMatch(/Removed/)
    expect(t).toContain('Op')
  })

  it('a skipped read says why, and no read at all is no line', () => {
    open(groupBySubject([report('r1', 'a', { assessments: [{ at: day(2), model: null, outcome: null, severity: null, confidence: null, reason: null, skipped: 'suspected severity 1' }] })]))
    expect(screen.getByTestId('subject-timeline')).toHaveTextContent('suspected severity 1')
    cleanup()
    open(groupBySubject([report('r1', 'a')]))
    expect(screen.queryAllByTestId('timeline-item').filter((li) => li.getAttribute('data-kind') === 'assessment')).toHaveLength(0)
  })

  it('Undo is still on every decision, as before', () => {
    open(groupBySubject([report('r1', 'a', { history: [decided] }), report('r2', 'a')]))
    expect(screen.getByTestId('reverse-d1')).toBeInTheDocument()
  })
})
