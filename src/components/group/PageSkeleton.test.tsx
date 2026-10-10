import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageSkeleton } from './PageSkeleton'

// #537 — a Page opens on its outline at once, so the tap is answered while the rest loads.
describe('PageSkeleton', () => {
  it('announces itself, is marked busy, and is not the loaded Page', () => {
    const { container } = render(<PageSkeleton />)
    expect(screen.getByRole('status').textContent).toMatch(/Loading/)
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(screen.queryByTestId('page-header')).toBeNull()
  })
})
