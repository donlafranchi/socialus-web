// #636 (F101) — checks that claim the whole criterion, each seen failing against a mutant
// (PR #634 lists the mutants). Criteria 3, 12, 13 and 15 are marked elsewhere.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ReviewQueue } from './ReviewQueue'
import { groupBySubject, orderSubjects, type ReviewSubject } from '@/lib/admin/review-subjects'
import type { QueuedReport, PastDecision } from '@/lib/admin/reports-queue'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const { requirePagePermission, fetchReviewQueue } = vi.hoisted(() => ({ requirePagePermission: vi.fn(), fetchReviewQueue: vi.fn(async () => []) }))
vi.mock('@/lib/staff/page-guard', () => ({ requirePagePermission }))
vi.mock('@/lib/admin/reports-queue', async (orig) => ({
  ...(await orig<typeof import('@/lib/admin/reports-queue')>()),
  fetchReviewQueue,
  fetchWeekSummary: vi.fn(async () => ({ answers: 0, coolDowns: 0 })),
  fetchAiMode: vi.fn(async () => 'shadow'),
}))
vi.mock('@/lib/admin/ai-readiness', () => ({ fetchAiReadiness: vi.fn(async () => null) }))

const day = (n: number) => new Date(Date.UTC(2026, 9, n))
const report = (id: string, groupId: string, over: Partial<QueuedReport> = {}): QueuedReport => ({
  reportId: id, body: `Report ${id}`, category: null, reportedAt: day(3), hiddenAt: day(3), removedAt: null, subjectKind: 'group', subjectId: groupId,
  groupId, groupName: `Page ${groupId}`, groupSlug: groupId, photoUrl: `https://example.test/${groupId}.webp`, ownerDisplayName: null, ownerHandle: null, history: [], ...over,
})
const decided = (over: Partial<PastDecision> = {}): PastDecision => ({
  decisionId: 'd1', outcome: 'removed', reasonCode: 'not_suitable', reasonNote: null, decidedAt: day(4), decidedByName: 'Op', reversesDecisionId: null, alreadyReversed: false, decidedByAi: false, ...over,
})

const onDecide = vi.fn(async () => {})
const onReverse = vi.fn(async () => {})
const show = (subjects: ReviewSubject[]) => render(<ReviewQueue subjects={subjects} onDecide={onDecide} onReverse={onReverse} />)
const rowOf = (id: string) => document.querySelector(`[data-subject="${id}"]`) as HTMLElement
const ids = () => screen.getAllByTestId('review-row').map((r) => r.getAttribute('data-subject'))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(day(16)) // fixtures sit on 1–6 October; on a real clock they pass the 14-day answer window and close themselves (#799, again 17 Oct)
  onDecide.mockClear()
  onReverse.mockClear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('F101.1 — the page is for operators only', () => {
  // [guards F101.1]
  it('a non-operator gets the 404 of an address that is not there, and nothing is read for them', async () => {
    const { default: AdminReportsPage } = await import('./page')
    requirePagePermission.mockRejectedValue(new Error('NEXT_NOT_FOUND'))
    await expect(AdminReportsPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(requirePagePermission).toHaveBeenCalledWith('reports.review')
    expect(fetchReviewQueue).not.toHaveBeenCalled()
  })
})

describe('F101.2 — what a row shows', () => {
  // [guards F101.2]
  it('shows the thumbnail, a 120-character excerpt, the severity, the reasons with their count, the AI, the answer, the reporters, the coordinated flag, the status and the age together', () => {
    const long = 'x'.repeat(300)
    const ai = { category: 'harassment', severity: 2, confidence: 0.91, outcome: 'remove' as const, reason: 'Insults a neighbour.' }
    const a = report('r1', 'a', { category: 'harassment', reporter: { filed: 5, upheld: 3, dismissed: 1, open: 1 }, ai, answer: { kind: 'wrong', reason: 'malicious', note: 'He reports everything.', at: day(4) }, subjectKind: 'post', postId: 'a', contentText: long })
    const b = report('r2', 'a', { category: 'harassment', reporter: { filed: 1, upheld: 0, dismissed: 0, open: 1 }, subjectKind: 'post', postId: 'a', contentText: long })
    const subjects = groupBySubject([a, b])
    subjects[0]!.coordinated = true
    show(subjects)
    const row = within(rowOf('a'))
    expect(row.getByTestId('review-thumb')).toBeInTheDocument()
    expect(row.getByTestId('review-excerpt').textContent!.length).toBeLessThanOrEqual(120)
    expect(row.getByTestId('review-severity')).toHaveTextContent('Severity 2')
    expect(row.getByTestId('review-reasons')).toHaveTextContent('Harassment ×2')
    expect(row.getByTestId('review-ai')).toHaveTextContent('AI: remove · 0.91')
    expect(row.getByTestId('review-answer')).toHaveTextContent('He reports everything.')
    expect(row.getByTestId('review-reporter')).toHaveTextContent('5 filed · 3 upheld · 1 dismissed')
    expect(row.getByTestId('review-coordinated')).toBeInTheDocument()
    expect(row.getByText(/Under appeal/)).toBeInTheDocument()
    expect(rowOf('a').textContent).toMatch(/hidden \d/)
  })

  it('says Hidden, Removed or Decided by the subject\'s state, and Under appeal only when the poster has answered', () => {
    show(groupBySubject([report('r1', 'a'), report('r2', 'b', { removedAt: day(5) })]))
    expect(within(rowOf('a')).queryByText(/Under appeal/)).toBeNull()
    expect(within(rowOf('a')).getByText(/Hidden/)).toBeInTheDocument()
    expect(within(rowOf('b')).getByText(/Removed/)).toBeInTheDocument()
  })
})

describe('F101.4 — order, sort, filter and the header', () => {
  const sev = (id: string, category: QueuedReport['category'], hidden: number, extra: QueuedReport[] = []) => [report(id, id, { category, hiddenAt: day(hidden) }), ...extra]
  const set = () =>
    groupBySubject([
      ...sev('old-spam', 'spam', 1),
      ...sev('new-harass', 'harassment', 6),
      ...sev('old-harass', 'harassment', 2),
      ...sev('busy-spam', 'spam', 3, [report('x1', 'busy-spam', { category: 'spam', hiddenAt: day(3) }), report('x2', 'busy-spam', { category: 'spam', hiddenAt: day(3) })]),
    ])

  // [guards F101.4]
  it('opens by severity then oldest hidden, sorts by age and by report count, filters by status, and the header counts the waiting rows by severity', () => {
    // The fixtures sit on 1–6 October; on a real clock the oldest passed the 14-day answer window on 15 October and closed itself.
    vi.setSystemTime(day(8))
    show(set())
    expect(ids()).toEqual(['old-harass', 'new-harass', 'old-spam', 'busy-spam'])
    expect(screen.getByTestId('review-waiting')).toHaveTextContent('4 waiting · 2 severity 2, 2 severity 4')
    fireEvent.change(screen.getByTestId('review-sort'), { target: { value: 'age' } })
    expect(ids()).toEqual(['old-spam', 'old-harass', 'busy-spam', 'new-harass'])
    fireEvent.change(screen.getByTestId('review-sort'), { target: { value: 'count' } })
    expect(ids()[0]).toBe('busy-spam')
    // Filter by status: hidden, removed, restored, under appeal.
    cleanup()
    show(
      groupBySubject([
        report('h', 'h'),
        report('rm', 'rm', { removedAt: day(5), history: [decided()] }),
        report('rs', 'rs', { hiddenAt: null, history: [decided({ outcome: 'restored' })] }),
        report('ap', 'ap', { answer: { kind: 'mistake', reason: null, note: null, at: day(4) } }),
      ]),
    )
    for (const [value, expected] of [['removed', ['rm']], ['restored', ['rs']], ['appeal', ['ap']], ['hidden', ['h', 'ap']]] as const) {
      fireEvent.change(screen.getByTestId('review-filter'), { target: { value } })
      expect(ids().sort(), value).toEqual([...expected].sort())
    }
  })
})

describe('F101.5 — two full-width buttons on every waiting row', () => {
  // [guards F101.5]
  it('Approve and Remove are on every waiting row, side by side at 48px, below the text, and each closes the row\'s reports', async () => {
    show(groupBySubject([report('r1', 'a'), report('r2', 'a'), report('r3', 'b')]))
    for (const id of ['a', 'b']) {
      const row = within(rowOf(id))
      const [approve, remove] = [row.getByTestId('review-approve'), row.getByTestId('review-remove')]
      expect(approve.className).toMatch(/min-h-12!/)
      expect(remove.className).toMatch(/min-h-12!/)
      expect(approve.parentElement).toBe(remove.parentElement)
      expect(approve.parentElement!.className).toMatch(/grid-cols-2/)
      // In the bottom half of the row: after the excerpt, before the history toggle.
      const html = rowOf(id).innerHTML
      expect(html.indexOf('review-excerpt')).toBeLessThan(html.indexOf('review-approve'))
      expect(html.indexOf('review-approve')).toBeLessThan(html.indexOf('review-details'))
    }
    fireEvent.click(within(rowOf('a')).getByTestId('review-remove'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100)
    })
    expect(onDecide.mock.calls.map((c) => (c as unknown as [{ reportId: string; outcome: string }])[0])).toEqual([
      expect.objectContaining({ reportId: 'r1', outcome: 'removed' }),
      expect.objectContaining({ reportId: 'r2', outcome: 'removed' }),
    ])
  })
})

describe('F101.6 — swipe right approves, swipe left removes, the colour and the word under the row', () => {
  const swipe = (row: HTMLElement, from: number, to: number) => {
    const surface = row.querySelector('.touch-pan-y') as HTMLElement
    fireEvent.pointerDown(surface, { clientX: from })
    fireEvent.pointerMove(surface, { clientX: to })
    return surface
  }

  // [guards F101.6]
  it('reveals the action\'s word and colour as the row moves, and decides only past the threshold', async () => {
    show(groupBySubject([report('r1', 'a'), report('r2', 'b')]))
    const right = swipe(rowOf('a'), 0, 40)
    expect(within(rowOf('a')).getByText('Approve', { selector: 'div[aria-hidden="true"]' }).className).toMatch(/success/)
    expect(within(rowOf('a')).getByText('Approve', { selector: 'div[aria-hidden="true"]' })).toBeInTheDocument()
    fireEvent.pointerUp(right)
    expect(onDecide).not.toHaveBeenCalled()
    const left = swipe(rowOf('b'), 0, -40)
    expect(within(rowOf('b')).getByText('Remove', { selector: 'div[aria-hidden="true"]' }).className).toMatch(/danger/)
    fireEvent.pointerUp(left)
    swipe(rowOf('a'), 0, 200)
    fireEvent.pointerUp(rowOf('a').querySelector('.touch-pan-y')!)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100)
    })
    expect(onDecide).toHaveBeenCalledWith(expect.objectContaining({ reportId: 'r1', outcome: 'restored' }))
    cleanup()
    onDecide.mockClear()
    show(groupBySubject([report('r9', 'z')]))
    swipe(rowOf('z'), 0, -200)
    fireEvent.pointerUp(rowOf('z').querySelector('.touch-pan-y')!)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100)
    })
    expect(onDecide).toHaveBeenCalledWith(expect.objectContaining({ reportId: 'r9', outcome: 'removed' }))
  })
})

describe('F101.7, F101.8 and F101.9 — one tap, five seconds to undo, the next row moves in', () => {
  // [guards F101.7]
  it('a decision is one tap, severity 1 Approve is two, and nothing else asks', async () => {
    show(groupBySubject([report('r1', 'a', { category: 'spam' }), report('r2', 'b', { category: 'sensitive_content' })]))
    fireEvent.click(within(rowOf('a')).getByTestId('review-approve'))
    expect(screen.queryByTestId('review-confirm')).toBeNull()
    fireEvent.click(within(rowOf('b')).getByTestId('review-remove'))
    expect(screen.queryByTestId('review-confirm')).toBeNull()
    cleanup()
    onDecide.mockClear()
    show(groupBySubject([report('r2', 'b', { category: 'sensitive_content' })]))
    fireEvent.click(within(rowOf('b')).getByTestId('review-approve'))
    expect(screen.getByTestId('review-confirm')).toBeInTheDocument()
    expect(onDecide).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByTestId('review-confirm')).getByRole('button', { name: 'Approve' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100)
    })
    expect(onDecide).toHaveBeenCalledTimes(1)
  })

  // [guards F101.8]
  it('no confirm dialog; a five-second Undo that, used, writes nothing and tells the member nothing', async () => {
    show(groupBySubject([report('r1', 'a', { category: 'spam' })]))
    fireEvent.click(within(rowOf('a')).getByTestId('review-approve'))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(onDecide).not.toHaveBeenCalled()
    expect(onReverse).not.toHaveBeenCalled()
    expect(rowOf('a')).not.toBeNull()
    // Not undone, it is sent at five seconds and not before.
    fireEvent.click(within(rowOf('a')).getByTestId('review-approve'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4900)
    })
    expect(onDecide).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(onDecide).toHaveBeenCalledTimes(1)
  })

  // [guards F101.9]
  it('after a decision the row goes and the next waiting row is the one in hand', () => {
    show(groupBySubject([report('r1', 'a', { category: 'harassment' }), report('r2', 'b', { category: 'spam' }), report('r3', 'c', { category: 'spam', hiddenAt: day(9) })]))
    expect(ids()).toEqual(['a', 'b', 'c'])
    fireEvent.click(within(rowOf('a')).getByTestId('review-remove'))
    expect(ids()).toEqual(['b', 'c'])
    expect(rowOf('b')).toHaveAttribute('aria-current', 'true')
  })
})

describe('F101.10 — a one-tap decision records a default reason', () => {
  // [guards F101.10]
  it('Approve says "Nothing wrong with it", Remove the reason that matches the top category, and the detail can change it afterwards', async () => {
    show(groupBySubject([report('r1', 'a', { category: 'spam' }), report('r2', 'b', { category: 'harassment' })]))
    fireEvent.click(within(rowOf('a')).getByTestId('review-approve'))
    fireEvent.click(within(rowOf('b')).getByTestId('review-remove'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100)
    })
    const calls = onDecide.mock.calls.map((c) => (c as unknown as [{ reportId: string; reasonCode: string }])[0])
    expect(calls.find((c) => c.reportId === 'r1')!.reasonCode).toBe('nothing_wrong')
    expect(calls.find((c) => c.reportId === 'r2')!.reasonCode).toBe(groupBySubject([report('r2', 'b', { category: 'harassment' })])[0]!.removeReason)
    expect(calls.find((c) => c.reportId === 'r2')!.reasonCode).not.toBe('nothing_wrong')
    // From the detail, the decision can be redone with another reason.
    cleanup()
    show(groupBySubject([report('r5', 'e', { history: [decided()] }), report('r6', 'e')]))
    fireEvent.click(screen.getByTestId('review-details'))
    fireEvent.click(within(screen.getAllByTestId('report-entry')[0]!).getByTestId('reject'))
    expect(screen.getByTestId('reasons-removed')).toBeInTheDocument()
  })
})

describe('F101.14 — on desktop: A approves, R removes, J/K move, U undoes', () => {
  const key = (k: string) => {
    const approve = document.querySelector('[data-testid="review-approve"]') as HTMLElement
    fireEvent.keyDown(approve, { key: k })
  }
  // [guards F101.14]
  it('each key does its one thing, only from inside the list', async () => {
    show(groupBySubject([report('r1', 'a', { category: 'harassment' }), report('r2', 'b', { category: 'spam' })]))
    key('a')
    expect(ids()).toEqual(['b'])
    key('u')
    expect(ids()).toEqual(['a', 'b'])
    key('r')
    expect(ids()).toEqual(['b'])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100)
    })
    expect(onDecide).toHaveBeenCalledWith(expect.objectContaining({ reportId: 'r1', outcome: 'removed' }))
    cleanup()
    show(groupBySubject([report('r1', 'a'), report('r2', 'b')]))
    const buttons = () => Array.from(document.querySelectorAll('[data-testid="review-approve"]')) as HTMLElement[]
    buttons()[0]!.focus()
    fireEvent.keyDown(buttons()[0]!, { key: 'j' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(document.activeElement).toBe(buttons()[1])
    fireEvent.keyDown(buttons()[1]!, { key: 'k' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(document.activeElement).toBe(buttons()[0])
    // Outside the list, a stray key decides nothing; with a modifier, nothing either.
    fireEvent.keyDown(document.body, { key: 'a' })
    fireEvent.keyDown(buttons()[0]!, { key: 'r', ctrlKey: true })
    expect(ids()).toEqual(['a', 'b'])
  })
})
