// #301 — L14: the draft's checklist. Name, where it is and a description;
// a photo is optional. Publish waits for the three.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { BeforeYouPublish } from './BeforeYouPublish'
import { CREATOR_RULES, RULES_VERSION } from '@/lib/creator-rules'

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
    fireEvent.click(screen.getByRole('checkbox', { name: /i agree/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(onPublish).toHaveBeenCalledWith(RULES_VERSION))
  })

  it('marks what is done', () => {
    render(<BeforeYouPublish {...base} hasName onPublish={vi.fn()} />)
    expect(screen.getByTestId('publish-item-name')).toHaveAttribute('data-done', 'true')
    expect(screen.getByTestId('publish-item-where')).toHaveAttribute('data-done', 'false')
  })
})

// F082 — the rules step sits in front of publishing, never in front of the draft.
describe('F082 — the rules before publishing', () => {
  const ready = { ...base, hasName: true, hasPlace: true, hasDescription: true, hasTags: true }

  // [guards F082.2]
  it('sets out each rule with its reason', () => {
    render(<BeforeYouPublish {...ready} onPublish={vi.fn()} />)
    for (const { rule, reason } of CREATOR_RULES) {
      expect(screen.getByText(rule)).toBeInTheDocument()
      expect(screen.getByText(reason)).toBeInTheDocument()
    }
    expect(screen.getByText('No pictures of children.')).toBeInTheDocument()
  })

  // [guards F082.4]
  it('will not publish until the member agrees, and publishes nothing', () => {
    const onPublish = vi.fn()
    render(<BeforeYouPublish {...ready} onPublish={onPublish} />)
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    expect(onPublish).not.toHaveBeenCalled()
  })

  // [guards F082.7]
  it('links to the rules page', () => {
    render(<BeforeYouPublish {...ready} onPublish={vi.fn()} />)
    expect(screen.getByRole('link', { name: /read the rules/i })).toHaveAttribute('href', '/rules')
  })

  // [guards F082.5]
  it('never asks the member to call themselves a business or uses legal or tax words', () => {
    render(<BeforeYouPublish {...ready} onPublish={vi.fn()} />)
    const text = screen.getByTestId('creator-rules').textContent ?? ''
    expect(text).not.toMatch(/business|legal|tax|licen[cs]e|entity|incorporat|llc/i)
  })
})

