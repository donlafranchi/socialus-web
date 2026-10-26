// #555 — the Page's shell: the card's name, kind and photo at once, in outline, marked busy.

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { PageShell } from './PageShell'

afterEach(cleanup)

describe('PageShell', () => {
  it('shows the Page\'s name, kind and photo from the card', () => {
    render(<PageShell card={{ name: 'Bean Co', kindLine: 'Business', imageUrl: 'https://x.test/a.webp' }} />)
    expect(screen.getByRole('heading', { name: 'Bean Co' })).toBeInTheDocument()
    expect(screen.getByText('Business')).toBeInTheDocument()
    expect(document.querySelector('img')).toHaveAttribute('src', 'https://x.test/a.webp')
  })

  it('needs no photo or kind', () => {
    render(<PageShell card={{ name: 'Bean Co' }} />)
    expect(screen.getByRole('heading', { name: 'Bean Co' })).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })

  it('says it is busy, for a screen reader', () => {
    const { container } = render(<PageShell card={{ name: 'Bean Co' }} />)
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent(/loading this page/i)
  })
})
