// #301 — L14: the draft's checklist. Name, where it is and a description;
// a photo is optional. Publish waits for the three.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { BeforeYouPublish } from './BeforeYouPublish'
import { RULES_VERSION } from '@/lib/creator-rules'

afterEach(cleanup)
const base = { editPath: '/g/draft-x/edit', hasName: false, hasPlace: false, hasDescription: false, hasTags: false, hasPhoto: false }

describe('#301 — Before you publish', () => {
  it('lists the four things and the optional photo, each with a way to add it', () => {
    render(<BeforeYouPublish {...base} onPublish={vi.fn()} />)
    for (const name of [/^name/i, /where it is/i, /description/i, /tags/i, /photo \(optional\)/i]) {
      const row = screen.getByTestId(`publish-item-${String(name).match(/[a-z]+/)![0]}`)
      expect(within(row).getByRole('link', { name: /add/i })).toHaveAttribute('href', '/g/draft-x/edit')
    }
  })

  it('will not publish until the four are done, and says what is missing', () => {
    render(<BeforeYouPublish {...base} hasName hasPlace hasTags onPublish={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
    expect(screen.getByText(/add a description to publish/i)).toBeInTheDocument()
  })

  // 2026-10-01: tags are set on the draft Page and still required to publish.
  it('a Page with no tags cannot publish', () => {
    render(<BeforeYouPublish {...base} hasName hasPlace hasDescription onPublish={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
    expect(screen.getByText(/add a tag to publish/i)).toBeInTheDocument()
  })

  it('publishes once they are, photo or not', async () => {
    const onPublish = vi.fn(async () => {})
    render(<BeforeYouPublish {...base} hasName hasPlace hasDescription hasTags onPublish={onPublish} />)
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(onPublish).toHaveBeenCalledWith(RULES_VERSION))
  })

  it('marks what is done', () => {
    render(<BeforeYouPublish {...base} hasName onPublish={vi.fn()} />)
    expect(screen.getByTestId('publish-item-name')).toHaveAttribute('data-done', 'true')
    expect(screen.getByTestId('publish-item-where')).toHaveAttribute('data-done', 'false')
  })
})

// Don, 2026-10-31 — one line, no four-rule step and no checkbox.
describe('publishing says the Terms apply, in one line', () => {
  const ready = { ...base, hasName: true, hasPlace: true, hasDescription: true, hasTags: true }

  it('"By posting you agree to the Terms", the Terms linked, no checkbox, no rules list', () => {
    render(<BeforeYouPublish {...ready} onPublish={vi.fn()} />)
    expect(screen.getByTestId('publish-terms')).toHaveTextContent('By posting you agree to the Terms.')
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms')
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByTestId('creator-rules')).toBeNull()
    expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled()
  })
})
