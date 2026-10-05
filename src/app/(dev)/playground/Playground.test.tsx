// #298 — the playground shows every shared component, in its states.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

vi.mock('next/navigation', () => ({ usePathname: () => '/playground', useRouter: () => ({ push: vi.fn() }) }))

import { Playground } from './Playground'

afterEach(cleanup)

describe('#298 — playground', () => {
  it('has a section for each shared component', () => {
    render(<Playground />)
    for (const name of ['Buttons', 'Follow button', 'Form fields', 'Sheet', 'Toast', 'Area picker']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    }
  })

  it('opens the sheet and shows the toast on demand', () => {
    render(<Playground />)
    fireEvent.click(screen.getByRole('button', { name: 'Open sheet' }))
    expect(screen.getByRole('dialog', { name: 'A sheet' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show toast' }))
    expect(screen.getByRole('status')).toHaveTextContent('Maya is in.')
  })
})
