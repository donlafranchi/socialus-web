// #287 — the operator's list of tags waiting for review.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { TagReviewList } from './TagReviewList'

afterEach(cleanup)

const TAGS = [
  { id: 't1', label: 'Sourdough', pages: 3, posts: 1 },
  { id: 't2', label: 'something unkind', pages: 1, posts: 0 },
]

describe('#287 — reviewing tags', () => {
  it('lists each waiting tag with where it is used', () => {
    render(<TagReviewList tags={TAGS} onReview={vi.fn()} />)
    const rows = screen.getAllByTestId('tag-review-row')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]!).getByText('Sourdough')).toBeInTheDocument()
    expect(rows[0]).toHaveTextContent(/3 Pages · 1 post/)
  })

  it('marks a tag safe or unsafe, and takes it off the list', async () => {
    const onReview = vi.fn(async () => {})
    render(<TagReviewList tags={TAGS} onReview={onReview} />)
    const [, second] = screen.getAllByTestId('tag-review-row')
    fireEvent.click(within(second!).getByRole('button', { name: /unsafe/i }))
    await waitFor(() => expect(onReview).toHaveBeenCalledWith({ tagId: 't2', verdict: 'unsafe' }))
    await waitFor(() => expect(screen.getAllByTestId('tag-review-row')).toHaveLength(1))
  })

  it('says so when nothing is waiting', () => {
    render(<TagReviewList tags={[]} onReview={vi.fn()} />)
    expect(screen.getByTestId('tag-review-empty')).toBeInTheDocument()
  })
})
