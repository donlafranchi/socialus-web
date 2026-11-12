// #301 — L14: the draft's checklist. Name, where it is and a description;
// a photo is optional. Publish waits for the three.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { BeforeYouPublish } from './BeforeYouPublish'
import { RULES_VERSION } from '@/lib/creator-rules'

afterEach(cleanup)
const base = { editPath: '/g/draft-x/edit', hasName: false, hasPlace: false, hasDescription: false, hasPhoto: false }

describe('#301 — Before you publish', () => {
  it('lists the four things and the optional photo, each with a way to add it', () => {
    render(<BeforeYouPublish {...base} onPublish={vi.fn()} />)
    for (const [key, name] of [['name', /^name/i], ['where', /where it is/i], ['description', /description/i], ['tags', /listed under/i], ['photo', /photo \(optional\)/i]] as const) {
      const row = screen.getByTestId(`publish-item-${key}`)
      expect(row).toHaveTextContent(name)
      // Listed under is suggested from the words, so it is done from the start and offers Change.
      expect(within(row).getByRole('link', { name: key === 'tags' ? /change/i : /add/i })).toHaveAttribute('href', '/g/draft-x/edit')
    }
  })

  it('will not publish until the four are done, and says what is missing', () => {
    render(<BeforeYouPublish {...base} hasName hasPlace onPublish={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
    expect(screen.getByText(/add a description to publish/i)).toBeInTheDocument()
  })

  // #1180 — a Page is always listed under something: none picked, publishing lists it under what its words say.
  it('a Page with nothing picked under Listed under can still publish', () => {
    render(<BeforeYouPublish {...base} hasName hasPlace hasDescription onPublish={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled()
    expect(screen.queryByText(/add a tag/i)).toBeNull()
  })

  it('publishes once they are, photo or not', async () => {
    const onPublish = vi.fn(async () => {})
    render(<BeforeYouPublish {...base} hasName hasPlace hasDescription onPublish={onPublish} />)
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
  const ready = { ...base, hasName: true, hasPlace: true, hasDescription: true }

  it('"By posting you agree to the Terms", the Terms linked, no checkbox, no rules list', () => {
    render(<BeforeYouPublish {...ready} onPublish={vi.fn()} />)
    expect(screen.getByTestId('publish-terms')).toHaveTextContent('By posting you agree to the Terms.')
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms')
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByTestId('creator-rules')).toBeNull()
    expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled()
  })
})
