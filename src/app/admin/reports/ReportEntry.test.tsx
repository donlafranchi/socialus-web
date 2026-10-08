// T122 (#12) — the review surface, two buttons and reversible decisions.
//
// The assertions that matter: both buttons are always present, neither is a
// confirm, and every past decision can be undone from the card it happened on.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ReportEntry } from './ReportEntry'
import type { QueuedReport, PastDecision } from '@/lib/admin/reports-queue'

const DECISION: PastDecision = {
  decisionId: 'd1',
  outcome: 'removed',
  reasonCode: 'not_suitable',
  reasonNote: null,
  decidedAt: new Date('2026-09-16T10:00:00Z'),
  decidedByName: 'Don',
  reversesDecisionId: null,
  alreadyReversed: false,
}

const REPORT: QueuedReport = {
  reportId: 'r1',
  body: 'This photo does not belong on a neighbourhood app.',
  category: 'sensitive_content',
  reportedAt: new Date('2026-09-15T09:00:00Z'),
  hiddenAt: new Date('2026-09-15T09:00:00Z'),
  removedAt: null,
  subjectKind: 'group',
  subjectId: 'g1',
  groupId: 'g1',
  groupName: 'Oak Park Bakery',
  groupSlug: 'oak-park-bakery',
  photoUrl: 'https://cdn.example.test/media/x.jpg',
  ownerDisplayName: 'Sam R.',
  ownerHandle: 'sam-r',
  history: [],
}

const onDecide = vi.fn(async () => {})
const onReverse = vi.fn(async () => {})

function renderEntry(over: Partial<QueuedReport> = {}) {
  onDecide.mockClear()
  onReverse.mockClear()
  return render(
    <ReportEntry
      report={{ ...REPORT, ...over }}
      hiddenFor="2 days"
      onDecide={onDecide}
      onReverse={onReverse}
    />,
  )
}

afterEach(cleanup)

describe('two buttons, both present', () => {
  it('offers approve and reject side by side, not a mode or a menu', () => {
    renderEntry()
    expect(screen.getByTestId('approve')).toBeInTheDocument()
    expect(screen.getByTestId('reject')).toBeInTheDocument()
  })

  it('neither button is a confirm — each opens its own reasons', () => {
    renderEntry()
    fireEvent.click(screen.getByTestId('reject'))
    const picker = screen.getByTestId('reasons-removed')
    expect(within(picker).getByTestId('reason-not_suitable')).toBeInTheDocument()
    // Not a yes/no dialog.
    expect(screen.queryByText(/are you sure/i)).toBeNull()
  })

  it('decides in two taps: outcome, then reason', async () => {
    renderEntry()
    fireEvent.click(screen.getByTestId('reject'))
    fireEvent.click(screen.getByTestId('reason-not_suitable'))
    await waitFor(() =>
      expect(onDecide).toHaveBeenCalledWith({
        reportId: 'r1',
        outcome: 'removed',
        reasonCode: 'not_suitable',
        reasonNote: undefined,
      }),
    )
  })

  it('offers restore reasons under approve, not removal ones', () => {
    renderEntry()
    fireEvent.click(screen.getByTestId('approve'))
    const picker = screen.getByTestId('reasons-restored')
    expect(within(picker).getByTestId('reason-nothing_wrong')).toBeInTheDocument()
    expect(within(picker).queryByTestId('reason-not_suitable')).toBeNull()
  })
})

describe('free text is the exception, not the path', () => {
  it('asks for a note only when the reason is "something else"', () => {
    renderEntry()
    fireEvent.click(screen.getByTestId('reject'))
    expect(screen.queryByTestId('reason-note')).toBeNull()
    fireEvent.click(screen.getByTestId('reason-other'))
    expect(screen.getByTestId('reason-note')).toBeInTheDocument()
  })

  it('will not submit "something else" with nothing written', async () => {
    renderEntry()
    fireEvent.click(screen.getByTestId('reject'))
    fireEvent.click(screen.getByTestId('reason-other'))
    expect(screen.getByTestId('reason-note-submit')).toBeDisabled()
    expect(onDecide).not.toHaveBeenCalled()
  })

  it('sends the note when one is written', async () => {
    renderEntry()
    fireEvent.click(screen.getByTestId('reject'))
    fireEvent.click(screen.getByTestId('reason-other'))
    fireEvent.change(screen.getByTestId('reason-note'), { target: { value: 'Duplicate of r0.' } })
    fireEvent.click(screen.getByTestId('reason-note-submit'))
    await waitFor(() =>
      expect(onDecide).toHaveBeenCalledWith(
        expect.objectContaining({ reasonCode: 'other', reasonNote: 'Duplicate of r0.' }),
      ),
    )
  })
})

describe('every decision is visible and reversible on the item', () => {
  it('shows what happened before, and who did it', () => {
    renderEntry({ history: [DECISION] })
    const hist = screen.getByTestId('decision-history')
    expect(hist).toHaveTextContent('Removed')
    expect(hist).toHaveTextContent('Not suitable here')
    expect(hist).toHaveTextContent('Don')
  })

  it('offers undo on a past decision — not a support request', async () => {
    renderEntry({ history: [DECISION] })
    fireEvent.click(screen.getByTestId('reverse-d1'))
    // Reversing a removal restores, so it offers restore reasons.
    fireEvent.click(within(screen.getByTestId('reverse-reasons')).getByTestId('reason-nothing_wrong'))
    await waitFor(() =>
      expect(onReverse).toHaveBeenCalledWith({
        decisionId: 'd1',
        reasonCode: 'nothing_wrong',
        reasonNote: undefined,
      }),
    )
  })

  it('does not offer undo twice on the same decision', () => {
    renderEntry({ history: [{ ...DECISION, alreadyReversed: true }] })
    expect(screen.queryByTestId('reverse-d1')).toBeNull()
    expect(screen.getByTestId('already-reversed')).toBeInTheDocument()
  })

  it('still offers both buttons on an already-decided report', () => {
    renderEntry({ history: [DECISION] })
    expect(screen.getByTestId('approve')).toBeInTheDocument()
    expect(screen.getByTestId('reject')).toBeInTheDocument()
  })
})

describe('the image is never the first thing the operator sees', () => {
  it('is blurred on load behind a control that says what it does', () => {
    renderEntry()
    expect(screen.getByTestId('reported-photo')).toHaveAttribute('data-shown', 'false')
    expect(screen.getByTestId('show-photo')).toHaveTextContent('Show photo')
  })

  it('reveals only on a deliberate tap', () => {
    renderEntry()
    fireEvent.click(screen.getByTestId('show-photo'))
    expect(screen.getByTestId('reported-photo')).toHaveAttribute('data-shown', 'true')
  })

  it('is readable without the image at all', () => {
    renderEntry()
    expect(screen.getByText(REPORT.body)).toBeInTheDocument()
    expect(screen.getByText('Oak Park Bakery')).toBeInTheDocument()
    expect(screen.getByText(/Hidden 2 days/)).toBeInTheDocument()
  })

  it('says the photo is removed rather than that there is none', () => {
    renderEntry({ removedAt: new Date('2026-09-16T10:00:00Z'), history: [DECISION] })
    expect(screen.getByText(/Photo removed/)).toBeInTheDocument()
  })
})

describe('who posted it', () => {
  it('names the poster, because judging a report needs it', () => {
    renderEntry()
    expect(screen.getByText(/Sam R\./)).toBeInTheDocument()
    expect(screen.getByText(/@sam-r/)).toBeInTheDocument()
  })
})

describe('F078 — the operator sees the reason the reporter chose', () => {
  it('shows it above what they wrote', () => {
    renderEntry()
    expect(screen.getByTestId('report-category')).toHaveTextContent(/sensitive content/i)
  })

  it('shows nothing for a report filed before reasons existed', () => {
    renderEntry({ category: null })
    expect(screen.queryByTestId('report-category')).toBeNull()
  })
})

describe('F100 — the AI\'s read on the report', () => {
  it('shows the suggestion, confidence and reason', () => {
    renderEntry({ ai: { category: 'spam', severity: 4, confidence: 0.92, outcome: 'remove', reason: 'Promotion.' } })
    expect(screen.getByTestId('report-ai')).toHaveTextContent('AI suggests remove (0.92): Promotion.')
  })
  it('says when it was not read', () => {
    renderEntry({ ai: { skipped: 'suspected severity 1: not sent to an AI provider (F100 criterion 12)' } })
    expect(screen.getByTestId('report-ai')).toHaveTextContent(/not sent to an AI provider/)
  })
  it('shows nothing when there is no read', () => {
    renderEntry()
    expect(screen.queryByTestId('report-ai')).toBeNull()
  })
})

describe('F078 — a reported Post', () => {
  const post = { subjectKind: 'post' as const, postId: 'p1', photoUrl: null, contentText: 'Buy my watches now.' }

  it('shows the words that were reported, not a photo or a "no photo" line', () => {
    renderEntry(post)
    expect(screen.getByTestId('reported-post')).toHaveTextContent('Buy my watches now.')
    expect(screen.queryByText(/has no photo/i)).toBeNull()
    expect(screen.queryByTestId('show-photo')).toBeNull()
  })

  it('says removed, not photo removed', () => {
    renderEntry({ ...post, removedAt: new Date('2026-09-16T09:00:00Z') })
    expect(screen.getByText(/^Removed/)).toBeInTheDocument()
    expect(screen.queryByText(/Photo removed/)).toBeNull()
  })
})

// F099 criterion 8 — the reviewer is told which image a report is about.
describe('F099 — which image', () => {
  // [guards F099.8]
  it.each([
    ['group', 'Photo removed'],
    ['page_picture', 'Page picture removed'],
    ['post_photo', 'Post photo removed'],
  ] as const)('a removed %s reads %s', (subjectKind, text) => {
    render(<ReportEntry report={{ ...REPORT, subjectKind, removedAt: new Date('2026-09-16T09:00:00Z') }} hiddenFor={null} onDecide={vi.fn()} onReverse={vi.fn()} />)
    expect(screen.getByText(new RegExp(text))).toBeInTheDocument()
  })
})

describe('F102 criterion 5 — the reporter\'s counters, operator only', () => {
  it('shows filed, upheld, dismissed and open on the report', () => {
    renderEntry({ reporter: { filed: 4, upheld: 1, dismissed: 2, open: 1 } })
    expect(screen.getByTestId('reporter-record')).toHaveTextContent('4 filed · 1 upheld · 2 dismissed · 1 open')
  })

  it('shows nothing when there is no record to show', () => {
    renderEntry()
    expect(screen.queryByTestId('reporter-record')).toBeNull()
  })
})
