import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { HappeningRows } from './HappeningRows'
import { COPY } from '@/lib/copy'
import type { BrowseResult } from '@/lib/feed/browse-feed'

afterEach(cleanup)

const post = (id: string): BrowseResult =>
  ({
    resultKind: 'post',
    resultId: id,
    groupId: 'g',
    groupKind: 'place',
    slug: 's',
    name: `Page ${id}`,
    href: `/g/s#announcement-${id}`,
    photoUrl: null,
    description: null,
    body: 'On',
    tags: [],
    startsAt: '2026-10-02T02:00:00Z',
    locationId: null,
    locationLabel: null,
    lat: null,
    lng: null,
    pageCreatedAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-30T00:00:00Z',
    postedAt: null,
    sortAt: '2026-10-02T02:00:00Z',
  }) as unknown as BrowseResult

describe('HappeningRows', () => {
  it('reads as a sentence: the stem, then each row completing it, soonest row first', () => {
    render(<HappeningRows rows={{ today: [post('a')], thisWeek: [post('b')], thisWeekend: [post('c')] }} />)
    expect(screen.getByText(COPY.happeningStem)).toBeInTheDocument()
    const labels = screen.getAllByTestId('happening-row').map((r) => r.getAttribute('aria-label'))
    expect(labels).toEqual([COPY.happeningToday, COPY.happeningThisWeek, COPY.happeningThisWeekend].map((l) => `${COPY.happeningStem} ${l}`))
  })

  // [guards F091.3]
  it('leaves an empty row out, rather than rendering it empty', () => {
    render(<HappeningRows rows={{ today: [], thisWeek: [post('b')], thisWeekend: [] }} />)
    expect(screen.getAllByTestId('happening-row')).toHaveLength(1)
    expect(screen.queryByText(COPY.happeningToday)).toBeNull()
  })

  // [guards F091.4]
  it('leaves the stem out when every row is out', () => {
    const { container } = render(<HappeningRows rows={{ today: [], thisWeek: [], thisWeekend: [] }} />)
    expect(container).toBeEmptyDOMElement()
  })
})
