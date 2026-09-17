// T122 (#12) — the review surface. Three rules the ticket states outright, and
// each is the kind that erodes quietly if nothing asserts it.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ReportEntry } from './ReportEntry'
import type { QueuedReport } from '@/lib/admin/reports-queue'

const REPORT: QueuedReport = {
  reportId: 'r1',
  body: 'This photo does not belong on a neighbourhood app.',
  reportedAt: new Date('2026-09-15T09:00:00Z'),
  hiddenAt: new Date('2026-09-15T09:00:00Z'),
  groupId: 'g1',
  groupName: 'Oak Park Bakery',
  groupSlug: 'oak-park-bakery',
  photoUrl: 'https://cdn.example.test/media/x.jpg',
  ownerDisplayName: 'Sam R.',
  ownerHandle: 'sam-r',
}

const onRestore = vi.fn(async () => {})
const onRemove = vi.fn(async () => {})

function renderEntry(over: Partial<QueuedReport> = {}) {
  onRestore.mockClear()
  onRemove.mockClear()
  return render(
    <ReportEntry
      report={{ ...REPORT, ...over }}
      hiddenFor="2 days"
      onRestore={onRestore}
      onRemove={onRemove}
    />,
  )
}

afterEach(cleanup)

describe('the image is never the first thing the operator sees', () => {
  it('is blurred on load, behind a control that says what it does', () => {
    renderEntry()
    const img = screen.getByTestId('reported-photo')
    expect(img).toHaveAttribute('data-shown', 'false')
    expect(img.style.filter).toContain('blur')
    expect(screen.getByTestId('show-photo')).toHaveTextContent('Show photo')
  })

  it('takes a deliberate tap to reveal — two taps to act on it, never one', () => {
    renderEntry()
    fireEvent.click(screen.getByTestId('show-photo'))
    expect(screen.getByTestId('reported-photo')).toHaveAttribute('data-shown', 'true')
    expect(screen.queryByTestId('show-photo')).toBeNull()
  })

  // Most reports are decided on the words, not the picture.
  it('is readable without the image at all', () => {
    renderEntry()
    expect(screen.getByText(REPORT.body)).toBeInTheDocument()
    expect(screen.getByText('Oak Park Bakery')).toBeInTheDocument()
    expect(screen.getByText(/Hidden 2 days/)).toBeInTheDocument()
  })

  it('says so plainly when the Page has no photo', () => {
    renderEntry({ photoUrl: null })
    expect(screen.queryByTestId('reported-photo')).toBeNull()
    expect(screen.getByText(/no photo/i)).toBeInTheDocument()
  })
})

describe('the destructive outcome is the harder one', () => {
  it('restores in a single tap — reversible, common, and the queue has to move', async () => {
    renderEntry()
    fireEvent.click(screen.getByTestId('restore-photo'))
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith('r1'))
  })

  it('never removes on the first tap', () => {
    renderEntry()
    fireEvent.click(screen.getByTestId('remove-photo'))
    expect(onRemove).not.toHaveBeenCalled()
    expect(screen.getByTestId('remove-confirm')).toBeInTheDocument()
  })

  it('removes only after the confirm', async () => {
    renderEntry()
    fireEvent.click(screen.getByTestId('remove-photo'))
    fireEvent.click(screen.getByTestId('remove-confirm-yes'))
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('r1'))
  })

  it('lets the operator back out of the confirm', () => {
    renderEntry()
    fireEvent.click(screen.getByTestId('remove-photo'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByTestId('remove-confirm')).toBeNull()
    expect(onRemove).not.toHaveBeenCalled()
  })
})

describe('who posted it', () => {
  // Don's ruling, 2026-09-17: content posted to the platform is subject to
  // review by the platform. The member-to-member rules are untouched.
  it('names the poster, because judging a report needs it', () => {
    renderEntry()
    expect(screen.getByText(/Sam R\./)).toBeInTheDocument()
    expect(screen.getByText(/@sam-r/)).toBeInTheDocument()
  })

  it('does not fall over when the Page has no founder on record', () => {
    renderEntry({ ownerDisplayName: null, ownerHandle: null })
    expect(screen.getByText(/Unknown member/)).toBeInTheDocument()
  })
})
