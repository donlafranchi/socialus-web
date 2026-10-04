// #301 — Create is one question: the kind only (L10).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { WhatAreYouStarting } from './WhatAreYouStarting'

afterEach(cleanup)

describe('#301 — What are you starting?', () => {
  it('asks one question with three answers, and nothing else', () => {
    render(<WhatAreYouStarting onStart={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'What are you starting?' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('Start waits for an answer', () => {
    render(<WhatAreYouStarting onStart={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled()
  })

  // Don, 2026-10-04: each kind is a question, with one line on what the Page is for.
  it('asks each kind as a question, in Don\'s words, with one line on what it is for', () => {
    render(<WhatAreYouStarting onStart={vi.fn()} />)
    const business = screen.getByRole('radio', { name: 'Have a business where you sell products or services?' })
    expect(business).toHaveAccessibleDescription(/^A Page for /)
    const group = screen.getByRole('radio', { name: 'Do you manage a group or meetup, or host events regularly?' })
    expect(group).toHaveAccessibleDescription(/^A Page for /)
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio.getAttribute('aria-label') ?? radio.closest('label')!.textContent).toMatch(/\?/)
    }
  })

  it('starts each as the right kind', async () => {
    for (const [label, kind] of [
      [/sell products or services/i, 'business'],
      [/teach a class/i, 'practice'],
      [/group or meetup/i, 'interest'],
    ] as const) {
      const onStart = vi.fn(async () => {})
      const { unmount } = render(<WhatAreYouStarting onStart={onStart} />)
      fireEvent.click(screen.getByRole('radio', { name: label }))
      fireEvent.click(screen.getByRole('button', { name: 'Start' }))
      await waitFor(() => expect(onStart).toHaveBeenCalledWith(kind))
      unmount()
    }
  })

  it('says nothing in the voice rules forbid', () => {
    const { container } = render(<WhatAreYouStarting onStart={vi.fn()} />)
    expect(container.textContent).not.toMatch(/\bnever\b/i)
  })

  it('says nothing is public until you publish', () => {
    render(<WhatAreYouStarting onStart={vi.fn()} />)
    expect(screen.getByText(/nothing is public until you publish/i)).toBeInTheDocument()
  })
})
