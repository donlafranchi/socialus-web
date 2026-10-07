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
}

const onDecide = vi.fn(async () => {})
const onReverse = vi.fn(async () => {})
const show = (subjects: ReviewSubject[]) => render(<ReviewQueue subjects={subjects} onDecide={onDecide} onReverse={onReverse} />)

beforeEach(() => {
  vi.useFakeTimers()
  onDecide.mockClear()
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

  // #398 — WCAG 2.1.1: shown and hidden from a tap or a keyboard, not by holding.
  it('a photo is blurred until chosen, unless the row is spam-tier', () => {
    const s = two()
    s[1]!.severity = 4
    show(s)
    const thumb = (id: string) => document.querySelector(`[data-subject="${id}"] [data-testid="review-thumb"]`)!
    const [first, second] = [thumb('a'), thumb('b')]
    expect(first).toHaveAttribute('data-blurred', 'true')
    expect(first).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(first!)
    expect(first).toHaveAttribute('data-blurred', 'false')
    expect(first).toHaveAccessibleName('Hide the photo')
    fireEvent.click(first!)
    expect(first).toHaveAttribute('data-blurred', 'true')
    expect(second).toHaveAttribute('data-blurred', 'false')
  })
})
