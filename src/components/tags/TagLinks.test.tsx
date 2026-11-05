// #316 / #1180 — a Page's labels: plain words from the shared list, each opening Explore under it.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { TagLinks } from './TagLinks'

afterEach(cleanup)

describe('#1180 — TagLinks', () => {
  it('shows each label as plain words, linking to Explore filtered by it', () => {
    render(<TagLinks tags={['Food & drink', 'Bakery']} />)
    expect(screen.getByRole('link', { name: 'Bakery' })).toHaveAttribute('href', '/explore?category=bakery')
    expect(screen.getByRole('link', { name: 'Food & drink' })).toHaveAttribute('href', '/explore?category=food%20%26%20drink')
    expect(screen.getByTestId('tag-chips')).not.toHaveTextContent('#')
  })

  it('in the list’s order, a top label before its finer one', () => {
    render(<TagLinks tags={['Bakery', 'Food & drink']} />)
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Food & drink', 'Bakery'])
  })

  it('leaves out an old free tag', () => {
    render(<TagLinks tags={['sourdough', 'Bakery']} />)
    expect(screen.queryByRole('link', { name: 'sourdough' })).toBeNull()
  })

  it('each link is a 44px tap target', () => {
    render(<TagLinks tags={['Bakery']} />)
    expect(screen.getByRole('link', { name: 'Bakery' })).toHaveClass('min-h-11')
  })

  it('renders nothing for no labels', () => {
    const { container } = render(<TagLinks tags={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
