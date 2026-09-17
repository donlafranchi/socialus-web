import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { PageDetailCard } from './PageDetailCard'

afterEach(cleanup)

const page = (over = {}) => ({
  id: 'g1',
  name: 'Clara’s Kitchen',
  category: 'bakery',
  photoUrl: null,
  locationLabel: 'Oak Park',
  href: '/p/ca/sacramento/g/claras-kitchen',
  ...over,
})

describe('PageDetailCard', () => {
  it('shows the Page name, category and where it is', () => {
    render(<PageDetailCard page={page()} onClose={vi.fn()} />)
    expect(screen.getByText('Clara’s Kitchen')).toBeInTheDocument()
    expect(screen.getByText('bakery')).toBeInTheDocument()
    expect(screen.getByTestId('page-detail-location')).toHaveTextContent('Oak Park')
  })

  it('links to the Page', () => {
    render(<PageDetailCard page={page()} onClose={vi.fn()} />)
    expect(screen.getByTestId('page-detail-open')).toHaveAttribute(
      'href',
      '/p/ca/sacramento/g/claras-kitchen',
    )
  })

  it('says so rather than offering a link that 404s', () => {
    render(<PageDetailCard page={page({ href: null })} onClose={vi.fn()} />)
    expect(screen.queryByTestId('page-detail-open')).toBeNull()
    expect(screen.getByTestId('page-detail-no-link')).toBeInTheDocument()
  })

  it('shows a photo when there is one, and no broken frame when there is not', () => {
    const { rerender } = render(<PageDetailCard page={page({ photoUrl: 'https://x/a.webp' })} onClose={vi.fn()} />)
    expect(screen.getByTestId('page-detail-photo')).toHaveAttribute('src', 'https://x/a.webp')
    rerender(<PageDetailCard page={page()} onClose={vi.fn()} />)
    expect(screen.queryByTestId('page-detail-photo')).toBeNull()
  })

  it('closes', () => {
    const onClose = vi.fn()
    render(<PageDetailCard page={page()} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
