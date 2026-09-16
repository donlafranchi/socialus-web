import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { PagePosts } from './PagePosts'
import type { PagePost } from '@/lib/groups/page-posts'

afterEach(cleanup)

const onPost = vi.fn()
const onEdit = vi.fn()

beforeEach(() => {
  onPost.mockReset()
  onEdit.mockReset()
  onPost.mockResolvedValue({ ok: true, data: { postId: 'p-new', createdAt: '2026-09-15T10:00:00Z' } })
  onEdit.mockResolvedValue({ ok: true, data: { postId: 'p-1' } })
})

const POSTS: PagePost[] = [
  {
    id: 'p-1',
    body: 'Sourdough is back Thursday.',
    createdAt: '2026-09-15T10:00:00Z',
    updatedAt: '2026-09-15T10:00:00Z',
  },
]

function renderPosts(overrides: Partial<Parameters<typeof PagePosts>[0]> = {}) {
  return render(
    <PagePosts
      groupId="g-1"
      posts={POSTS}
      canPost={false}
      onPost={onPost}
      onEdit={onEdit}
      {...overrides}
    />,
  )
}

describe('who gets the control (acceptance 1)', () => {
  it('gives a visitor no way to post and no way to edit', () => {
    renderPosts()
    expect(screen.queryByTestId('page-post-body')).not.toBeInTheDocument()
    expect(screen.queryByTestId('page-post-edit')).not.toBeInTheDocument()
  })

  it('gives the owner both', () => {
    renderPosts({ canPost: true })
    expect(screen.getByTestId('page-post-body')).toBeInTheDocument()
    expect(screen.getByTestId('page-post-edit')).toBeInTheDocument()
  })
})

describe('what a visitor sees', () => {
  it('reads the post', () => {
    renderPosts()
    expect(screen.getByText('Sourdough is back Thursday.')).toBeInTheDocument()
  })

  it('sees no price and no buy control — this is the Page talking, not a listing', () => {
    const { container } = renderPosts()
    expect(container.textContent).not.toMatch(/\$|buy|price|add to cart/i)
  })

  it('sees nothing at all when the Page has said nothing', () => {
    const { container } = renderPosts({ posts: [] })
    expect(container.textContent).toBe('')
  })
})

describe('what the owner sees when there is nothing yet', () => {
  it('is told what the space is for, with no count of anything', () => {
    renderPosts({ canPost: true, posts: [] })
    const empty = screen.getByTestId('page-posts-empty')
    expect(empty).toHaveTextContent("Nothing here yet.")
    expect(empty.textContent).not.toMatch(/\b0\b|zero/i)
  })
})

describe('posting', () => {
  it('will not send an empty body', () => {
    renderPosts({ canPost: true, posts: [] })
    expect(screen.getByTestId('page-post-send')).toBeDisabled()
  })

  it('sends what was typed, trimmed, and shows it straight away', async () => {
    renderPosts({ canPost: true, posts: [] })
    fireEvent.change(screen.getByTestId('page-post-body'), {
      target: { value: '  Market stall on Saturday.  ' },
    })
    fireEvent.click(screen.getByTestId('page-post-send'))
    await waitFor(() =>
      expect(onPost).toHaveBeenCalledWith({ groupId: 'g-1', body: 'Market stall on Saturday.' }),
    )
    expect(await screen.findByText('Market stall on Saturday.')).toBeInTheDocument()
  })

  it('clears the box after sending, so the same words cannot go twice', async () => {
    renderPosts({ canPost: true, posts: [] })
    fireEvent.change(screen.getByTestId('page-post-body'), { target: { value: 'Open late tonight.' } })
    fireEvent.click(screen.getByTestId('page-post-send'))
    await waitFor(() => expect(screen.getByTestId('page-post-body')).toHaveValue(''))
  })

  it('keeps the words and says what happened when the send fails', async () => {
    onPost.mockResolvedValue({ ok: false, message: 'That didn’t go through. Mind trying again?', code: 'transient' })
    renderPosts({ canPost: true, posts: [] })
    fireEvent.change(screen.getByTestId('page-post-body'), { target: { value: 'Open late tonight.' } })
    fireEvent.click(screen.getByTestId('page-post-send'))
    expect(await screen.findByTestId('page-post-error')).toHaveTextContent('Mind trying again?')
    expect(screen.getByTestId('page-post-body')).toHaveValue('Open late tonight.')
  })
})

describe('editing in place (acceptance 4)', () => {
  it('opens with what was already said', () => {
    renderPosts({ canPost: true })
    fireEvent.click(screen.getByTestId('page-post-edit'))
    expect(screen.getByTestId('page-post-edit-body')).toHaveValue('Sourdough is back Thursday.')
  })

  it('replaces the post rather than adding a second one', async () => {
    renderPosts({ canPost: true })
    fireEvent.click(screen.getByTestId('page-post-edit'))
    fireEvent.change(screen.getByTestId('page-post-edit-body'), {
      target: { value: 'Sourdough is back Friday.' },
    })
    fireEvent.click(screen.getByTestId('page-post-edit-save'))
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith({ postId: 'p-1', body: 'Sourdough is back Friday.' }))
    expect(await screen.findByText('Sourdough is back Friday.')).toBeInTheDocument()
    expect(screen.getAllByTestId('page-post')).toHaveLength(1)
    expect(screen.queryByText('Sourdough is back Thursday.')).not.toBeInTheDocument()
  })

  it('leaves the post alone on cancel', () => {
    renderPosts({ canPost: true })
    fireEvent.click(screen.getByTestId('page-post-edit'))
    fireEvent.change(screen.getByTestId('page-post-edit-body'), { target: { value: 'Something else.' } })
    fireEvent.click(screen.getByTestId('page-post-edit-cancel'))
    expect(screen.getByText('Sourdough is back Thursday.')).toBeInTheDocument()
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('offers no way to delete (acceptance 4)', () => {
    const { container } = renderPosts({ canPost: true })
    expect(container.textContent).not.toMatch(/delete|remove|take down/i)
  })
})

describe('copy', () => {
  it('never writes about this the way a feed does', () => {
    const { container } = renderPosts({ canPost: true })
    const text = container.textContent ?? ''
    for (const word of ['Post', 'Share', 'Update', 'Feed', 'Publish']) {
      expect(text, `copy must not say "${word}"`).not.toMatch(new RegExp(`\\b${word}`, 'i'))
    }
  })

  it('uses no em dash and no word for a kind of person', () => {
    const { container } = renderPosts({ canPost: true })
    const text = container.textContent ?? ''
    expect(text).not.toContain('—')
    for (const noun of ['creator', 'vendor', 'seller', 'maker', 'supporter', 'patron', 'customer', 'shop']) {
      expect(text.toLowerCase(), `copy must not say "${noun}"`).not.toContain(noun)
    }
  })
})
