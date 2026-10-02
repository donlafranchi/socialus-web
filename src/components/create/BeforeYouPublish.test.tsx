// #301 — L14: the draft's checklist. Name, where it is and a description;
// a photo is optional. Publish waits for the three.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { BeforeYouPublish } from './BeforeYouPublish'

afterEach(cleanup)
const base = { editPath: '/g/draft-x/edit', hasName: false, hasPlace: false, hasDescription: false, hasPhoto: false }

describe('#301 — Before you publish', () => {
  it('lists the three things and the optional photo, each with a way to add it', () => {
    render(<BeforeYouPublish {...base} onPublish={vi.fn()} />)
    for (const name of [/^name/i, /where it is/i, /description/i, /photo \(optional\)/i]) {
      const row = screen.getByTestId(`publish-item-${String(name).match(/[a-z]+/)![0]}`)
      expect(within(row).getByRole('link', { name: /add/i })).toHaveAttribute('href', '/g/draft-x/edit')
    }
  })

  it('will not publish until the three are done, and says what is missing', () => {
    render(<BeforeYouPublish {...base} hasName hasPlace onPublish={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
    expect(screen.getByText(/add a description to publish/i)).toBeInTheDocument()
  })

  it('publishes once they are, photo or not', async () => {
    const onPublish = vi.fn(async () => {})
    render(<BeforeYouPublish {...base} hasName hasPlace hasDescription onPublish={onPublish} />)
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(onPublish).toHaveBeenCalled())
  })

  it('marks what is done', () => {
    render(<BeforeYouPublish {...base} hasName onPublish={vi.fn()} />)
    expect(screen.getByTestId('publish-item-name')).toHaveAttribute('data-done', 'true')
    expect(screen.getByTestId('publish-item-where')).toHaveAttribute('data-done', 'false')
  })
})
