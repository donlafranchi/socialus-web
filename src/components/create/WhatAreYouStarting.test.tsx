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

  it('starts a shop, a service or a group for meetups as the right kind', async () => {
    for (const [label, kind] of [
      [/opening a shop/i, 'business'],
      [/offering a service/i, 'practice'],
      [/creating a group/i, 'interest'],
    ] as const) {
      const onStart = vi.fn(async () => {})
      const { unmount } = render(<WhatAreYouStarting onStart={onStart} />)
      fireEvent.click(screen.getByRole('radio', { name: label }))
      fireEvent.click(screen.getByRole('button', { name: 'Start' }))
      await waitFor(() => expect(onStart).toHaveBeenCalledWith(kind))
      unmount()
    }
  })

  it('says nothing is public until you publish', () => {
    render(<WhatAreYouStarting onStart={vi.fn()} />)
    expect(screen.getByText(/nothing is public until you publish/i)).toBeInTheDocument()
  })
})
