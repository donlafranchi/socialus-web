import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { PagePosts } from './PagePosts'
import { COPY } from '@/lib/copy'

// F072 — a Page owner announces something, with a time and a place on it.

const { searchPlacesAction } = vi.hoisted(() => ({ searchPlacesAction: vi.fn() }))
vi.mock('@/app/_actions/location-actions', () => ({ searchPlacesAction }))
vi.mock('@/lib/geocoding', () => ({
  geocode: vi.fn(async () => []),
  GeocodingUnavailableError: class extends Error {},
}))

const onPost = vi.fn(async (_i: unknown) => ({
  ok: true as const,
  data: { postId: 'pp-new', createdAt: '2026-09-21T12:00:00.000Z' },
}))
const onEdit = vi.fn(async (_i: unknown) => ({ ok: true as const, data: { postId: 'pp-1' } }))
const onCreateLocation = vi.fn(async (_i: unknown) => ({
  ok: true as const,
  data: { id: 'loc-new', label: 'The church hall' },
}))

const POST = {
  id: 'pp-1',
  body: 'Sourdough is back Thursday.',
  createdAt: '2026-09-20T12:00:00.000Z',
  updatedAt: '2026-09-20T12:00:00.000Z',
  startsAt: null as string | null,
  endsAt: null as string | null,
  locationLabel: null as string | null,
}

/** bug #211 — a post with an id of your choosing. */
const postFixture = (over: Partial<typeof POST> = {}) => ({ ...POST, ...over })

function renderPosts(over: Partial<Parameters<typeof PagePosts>[0]> = {}) {
  return render(
    <PagePosts
      groupId="g1"
      posts={[]}
      canPost
      followerCount={0}
      onPost={onPost}
      onEdit={onEdit}
      onCreateLocation={onCreateLocation as never}
      {...over}
    />,
  )
}

beforeEach(() => {
  onPost.mockClear()
  onEdit.mockClear()
  onCreateLocation.mockClear()
  searchPlacesAction.mockReset()
  searchPlacesAction.mockResolvedValue({
    ok: true,
    data: [{ id: 'pl-oak-park', name: 'Oak Park', kind: 'neighborhood', parentName: 'Sacramento' }],
  })
})
afterEach(cleanup)

async function pickAPlace(prefix = 'announce') {
  fireEvent.click(screen.getByTestId(`${prefix}-add-place`))
  fireEvent.change(screen.getByTestId(`${prefix}-place-address-input`), {
    target: { value: 'Oak Park' },
  })
  await waitFor(() => screen.getByTestId(`${prefix}-place-address-suggestion-0`))
  fireEvent.click(screen.getByTestId(`${prefix}-place-address-suggestion-0`))
}

describe('the word', () => {
  it('is announcement, never bulletin and never post', () => {
    const { container } = renderPosts({ posts: [POST] })
    // F080's safety line is Don's and says "post" as a verb, to anyone about
    // anything they share; the rule is about naming an announcement.
    const text = (container.textContent ?? '').replace(COPY.postingSafety, '')
    expect(text).toMatch(/Announce/)
    expect(text.toLowerCase()).not.toContain('bulletin')
    // "post" as a word on its own. `data-testid` values are not copy.
    expect(text.toLowerCase()).not.toMatch(/\bposts?\b/)
  })

  it('names the primary control Announce', () => {
    renderPosts()
    expect(screen.getByTestId('page-post-send')).toHaveTextContent('Announce')
  })
})

describe('a time on it', () => {
  it('sends what the creator typed as an instant in the metro’s zone', async () => {
    renderPosts()
    fireEvent.change(screen.getByTestId('page-post-body'), {
      target: { value: 'Bread class Thursday.' },
    })
    fireEvent.change(screen.getByTestId('announce-date'), { target: { value: '2026-09-24' } })
    fireEvent.change(screen.getByTestId('announce-time'), { target: { value: '19:00' } })
    fireEvent.click(screen.getByTestId('page-post-send'))
    await waitFor(() =>
      // 7pm in Sacramento, not 7pm UTC and not 7pm wherever the reader is.
      expect(onPost).toHaveBeenCalledWith(
        expect.objectContaining({ startsAt: '2026-09-25T02:00:00.000Z' }),
      ),
    )
  })

  it('sends no time at all when none was given — an undated announcement is a first-class one', async () => {
    renderPosts()
    fireEvent.change(screen.getByTestId('page-post-body'), {
      target: { value: 'Sourdough is back.' },
    })
    fireEvent.click(screen.getByTestId('page-post-send'))
    await waitFor(() => expect(onPost).toHaveBeenCalled())
    expect(onPost).toHaveBeenCalledWith(expect.objectContaining({ startsAt: null }))
  })

  it('refuses half a time rather than inventing the other half', async () => {
    // F072 § Not this rules out all-day announcements, so a date on its own
    // has nothing to become. Guessing midnight would put a Thursday evening
    // on Wednesday night for a reader one zone east.
    renderPosts()
    fireEvent.change(screen.getByTestId('page-post-body'), { target: { value: 'x' } })
    fireEvent.change(screen.getByTestId('announce-date'), { target: { value: '2026-09-24' } })
    fireEvent.click(screen.getByTestId('page-post-send'))
    await waitFor(() =>
      expect(screen.getByTestId('page-post-error')).toHaveTextContent(/both a date and a time/i),
    )
    expect(onPost).not.toHaveBeenCalled()
  })

  it('shows the time back in the metro’s words', () => {
    renderPosts({ posts: [{ ...POST, startsAt: '2026-09-25T02:00:00.000Z' }] })
    expect(screen.getByTestId('page-post-when')).toHaveTextContent('Thursday, September 24')
    expect(screen.getByTestId('page-post-when')).toHaveTextContent('7:00pm')
  })

  it('shows nothing about time on an undated announcement', () => {
    renderPosts({ posts: [POST] })
    expect(screen.queryByTestId('page-post-when')).toBeNull()
  })
})

describe('a place of its own', () => {
  it('reads as being at its Page’s address until one is given', () => {
    renderPosts()
    expect(screen.getByTestId('announce-place-current')).toHaveTextContent(/Page’s address/i)
  })

  it('makes the Location and sends its id', async () => {
    renderPosts()
    fireEvent.change(screen.getByTestId('page-post-body'), { target: { value: 'Bread class.' } })
    await pickAPlace()
    fireEvent.click(screen.getByTestId('page-post-send'))
    await waitFor(() => expect(onCreateLocation).toHaveBeenCalled())
    await waitFor(() =>
      expect(onPost).toHaveBeenCalledWith(expect.objectContaining({ locationId: 'loc-new' })),
    )
  })

  it('leaves nothing behind when the place could not be made', async () => {
    // Criterion 5. The announcement is never written, so there is no row on
    // the Page, in browse, or in its Page's history.
    onCreateLocation.mockResolvedValueOnce({
      ok: false,
      message: 'A Location needs a real address or a neighbourhood — we never guess one.',
      code: 'location_needs_place',
    } as never)
    renderPosts()
    fireEvent.change(screen.getByTestId('page-post-body'), { target: { value: 'Bread class.' } })
    await pickAPlace()
    fireEvent.click(screen.getByTestId('page-post-send'))
    await waitFor(() =>
      expect(screen.getByTestId('page-post-error')).toHaveTextContent(/never guess one/i),
    )
    expect(onPost).not.toHaveBeenCalled()
    expect(screen.queryByTestId('page-post')).toBeNull()
  })

  it('shows an announcement’s own place on it', () => {
    renderPosts({ posts: [{ ...POST, locationLabel: 'The church hall' }] })
    expect(screen.getByTestId('page-post-when')).toHaveTextContent('The church hall')
  })
})

describe('who sees this', () => {
  it('uses the ratified words, and sits on Anyone', () => {
    renderPosts()
    expect(screen.getByTestId('announce-audience')).toHaveTextContent('Who sees this')
    expect(screen.getByTestId('announce-audience-label')).toHaveTextContent('Anyone')
    expect(screen.getByTestId('announce-audience-switch')).toHaveAttribute('aria-checked', 'true')
  })

  it('names the people, never a kind of post', () => {
    renderPosts()
    fireEvent.click(screen.getByTestId('announce-audience-switch'))
    const label = screen.getByTestId('announce-audience-label').textContent ?? ''
    expect(label).toBe('Only people who get updates from you')
    expect(label.toLowerCase()).not.toContain('announcement')
    expect(label.toLowerCase()).not.toContain('bulletin')
  })

  it('counts the people at the restricted setting', () => {
    renderPosts({ followerCount: 42 })
    fireEvent.click(screen.getByTestId('announce-audience-switch'))
    expect(screen.getByTestId('announce-audience-count')).toHaveTextContent('42 right now')
  })

  it('says Nobody yet at zero, never "0"', () => {
    renderPosts({ followerCount: 0 })
    fireEvent.click(screen.getByTestId('announce-audience-switch'))
    const count = screen.getByTestId('announce-audience-count')
    expect(count).toHaveTextContent('Nobody yet')
    expect(count.textContent).not.toMatch(/\b0\b/)
  })

  it('shows the restricted setting rather than hiding it', () => {
    renderPosts()
    expect(screen.getByTestId('announce-audience-switch')).toBeInTheDocument()
  })

  it('will not post with it, and says why', async () => {
    // Follower delivery does not exist. Telling a creator they reached 42
    // people who receive nothing is a lie; hiding the setting is a different
    // lie. So: visible, choosable, and plainly not sendable yet.
    renderPosts({ followerCount: 42 })
    fireEvent.change(screen.getByTestId('page-post-body'), { target: { value: 'x' } })
    fireEvent.click(screen.getByTestId('announce-audience-switch'))
    expect(screen.getByTestId('announce-audience-blocked')).toHaveTextContent(/reach nobody/i)
    expect(screen.getByTestId('page-post-send')).toBeDisabled()
    fireEvent.click(screen.getByTestId('page-post-send'))
    await waitFor(() => expect(onPost).not.toHaveBeenCalled())
  })
})

describe('editing in place', () => {
  it('stays the same announcement — the id does not change', async () => {
    renderPosts({ posts: [POST] })
    fireEvent.click(screen.getByTestId('page-post-edit'))
    fireEvent.change(screen.getByTestId('page-post-edit-body'), {
      target: { value: 'Sourdough is back Friday.' },
    })
    fireEvent.click(screen.getByTestId('page-post-edit-save'))
    await waitFor(() =>
      expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ postId: 'pp-1' })),
    )
    expect(screen.getAllByTestId('page-post')).toHaveLength(1)
  })

  it('starts from the time already on it', () => {
    renderPosts({ posts: [{ ...POST, startsAt: '2026-09-25T02:00:00.000Z' }] })
    fireEvent.click(screen.getByTestId('page-post-edit'))
    expect(screen.getByTestId('page-post-edit-date')).toHaveValue('2026-09-24')
    expect(screen.getByTestId('page-post-edit-time')).toHaveValue('19:00')
  })

  it('can take the time off again', async () => {
    renderPosts({ posts: [{ ...POST, startsAt: '2026-09-25T02:00:00.000Z' }] })
    fireEvent.click(screen.getByTestId('page-post-edit'))
    fireEvent.click(screen.getByTestId('page-post-edit-clear-when'))
    fireEvent.click(screen.getByTestId('page-post-edit-save'))
    await waitFor(() =>
      expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ startsAt: null })),
    )
  })

  it('leaves the place alone when the address control was never opened', async () => {
    renderPosts({ posts: [{ ...POST, locationLabel: 'The church hall' }] })
    fireEvent.click(screen.getByTestId('page-post-edit'))
    fireEvent.click(screen.getByTestId('page-post-edit-save'))
    await waitFor(() => expect(onEdit).toHaveBeenCalled())
    expect(onEdit.mock.calls[0][0]).not.toHaveProperty('locationId')
  })

  it('offers no way to delete one', () => {
    renderPosts({ posts: [POST] })
    expect(screen.queryByText(/^delete$/i)).toBeNull()
  })
})

describe('who gets a control at all', () => {
  it('a visitor gets none', () => {
    renderPosts({ canPost: false, posts: [POST] })
    expect(screen.queryByTestId('page-post-send')).toBeNull()
    expect(screen.queryByTestId('page-post-edit')).toBeNull()
  })

  it('a visitor sees no empty section on a Page with nothing on it', () => {
    const { container } = renderPosts({ canPost: false, posts: [] })
    expect(container.firstChild).toBeNull()
  })
})

// bug #211 — you arrive on the announcement you tapped.
describe('arriving from a browse card', () => {
  const withHash = (hash: string) => {
    window.history.replaceState(null, '', `/g/x-abc${hash}`)
  }

  // jsdom has no scrollIntoView. The component calls it optionally so its
  // absence costs the scroll and not the highlight — this stub is so the
  // "brings it into view" test has something to assert on.
  const originalScrollIntoView = Element.prototype.scrollIntoView
  afterEach(() => {
    window.history.replaceState(null, '', '/')
    Element.prototype.scrollIntoView = originalScrollIntoView
  })

  it('gives every announcement an id a fragment can name', () => {
    renderPosts({ posts: [postFixture({ id: 'p-1' }), postFixture({ id: 'p-2' })] })
    expect(document.getElementById('announcement-p-1')).not.toBeNull()
    expect(document.getElementById('announcement-p-2')).not.toBeNull()
  })

  it('marks the one the fragment names even where scrollIntoView does not exist', async () => {
    // jsdom is that environment, and so was the first version of this fix:
    // the throw took the highlight with it.
    expect(Element.prototype.scrollIntoView).toBeUndefined()
    withHash('#announcement-p-2')
    renderPosts({ posts: [postFixture({ id: 'p-1' }), postFixture({ id: 'p-2' })] })
    // The mark lands after paint, deliberately — see the effect's comment.
    await waitFor(() =>
      expect(document.getElementById('announcement-p-2')).toHaveAttribute('data-highlighted', 'true'),
    )
    expect(document.getElementById('announcement-p-1')).not.toHaveAttribute('data-highlighted')
  })

  it('brings it into view — the list is below the composer for an owner', async () => {
    withHash('#announcement-p-2')
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    renderPosts({ canPost: true, posts: [postFixture({ id: 'p-1' }), postFixture({ id: 'p-2' })] })
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
  })

  it('does nothing at all when the fragment names something else', async () => {
    // '#announce' is the composer's own anchor (#185). It must not be read as
    // an announcement id, or the owner bar's button would mark a random row.
    withHash('#announce')
    renderPosts({ posts: [postFixture({ id: 'p-1' })] })
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    expect(document.getElementById('announcement-p-1')).not.toHaveAttribute('data-highlighted')
  })

  it('does nothing when the fragment names an announcement that is not here', async () => {
    withHash('#announcement-nope')
    renderPosts({ posts: [postFixture({ id: 'p-1' })] })
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    expect(document.getElementById('announcement-p-1')).not.toHaveAttribute('data-highlighted')
  })
})

// #260 — a dated announcement can be added to a calendar; an undated one cannot.
describe('add to calendar', () => {
  it('is offered on an announcement with a start time', () => {
    renderPosts({ canPost: false, posts: [postFixture({ id: 'p-cal', startsAt: '2026-09-11T02:00:00Z' })] })
    expect(screen.getByTestId('add-to-calendar').getAttribute('download')).toMatch(/\.ics$/)
  })

  it('is not offered on one without', () => {
    renderPosts({ canPost: false, posts: [postFixture({ id: 'p-nocal', startsAt: null })] })
    expect(screen.queryByTestId('add-to-calendar')).toBeNull()
  })
})

describe('#318 — deleting a post', () => {
  const onDelete = vi.fn(async (_i: unknown) => ({ ok: true as const, data: { postId: 'pp-1' } }))

  it('asks before it deletes, and Keep it changes nothing', () => {
    renderPosts({ posts: [postFixture()], onDelete })
    fireEvent.click(screen.getByTestId('page-post-delete'))
    expect(screen.getByRole('alertdialog', { name: /delete this post/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /keep it/i }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getAllByTestId('page-post')).toHaveLength(1)
  })

  it('deletes on confirm and takes the post off the Page', async () => {
    renderPosts({ posts: [postFixture()], onDelete })
    fireEvent.click(screen.getByTestId('page-post-delete'))
    fireEvent.click(screen.getByRole('button', { name: /delete post/i }))
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith({ postId: 'pp-1' }))
    await waitFor(() => expect(screen.queryAllByTestId('page-post')).toHaveLength(0))
  })

  it('is not offered to anyone who cannot post', () => {
    renderPosts({ posts: [postFixture()], onDelete, canPost: false })
    expect(screen.queryByTestId('page-post-delete')).toBeNull()
  })
})

// #262 — an optional end time, the same day as the start.
describe('an end time on it', () => {
  const typeStart = () => {
    fireEvent.change(screen.getByTestId('page-post-body'), { target: { value: 'Bread class Thursday.' } })
    fireEvent.change(screen.getByTestId('announce-date'), { target: { value: '2026-09-24' } })
    fireEvent.change(screen.getByTestId('announce-time'), { target: { value: '19:00' } })
  }

  it('sends the end as an instant in the metro’s zone', async () => {
    renderPosts()
    typeStart()
    fireEvent.change(screen.getByTestId('announce-end-time'), { target: { value: '21:00' } })
    fireEvent.click(screen.getByTestId('page-post-send'))
    await waitFor(() =>
      expect(onPost).toHaveBeenCalledWith(
        expect.objectContaining({ startsAt: '2026-09-25T02:00:00.000Z', endsAt: '2026-09-25T04:00:00.000Z' }),
      ),
    )
  })

  it('sends no end when none was given', async () => {
    renderPosts()
    typeStart()
    fireEvent.click(screen.getByTestId('page-post-send'))
    await waitFor(() => expect(onPost).toHaveBeenCalledWith(expect.objectContaining({ endsAt: null })))
  })

  it('refuses an end before the start, and says so', async () => {
    renderPosts()
    typeStart()
    fireEvent.change(screen.getByTestId('announce-end-time'), { target: { value: '18:00' } })
    fireEvent.click(screen.getByTestId('page-post-send'))
    expect(await screen.findByTestId('page-post-error')).toBeInTheDocument()
    expect(onPost).not.toHaveBeenCalled()
  })

  it('shows the range back', () => {
    renderPosts({ posts: [{ ...POST, startsAt: '2026-09-25T02:00:00.000Z', endsAt: '2026-09-25T04:00:00.000Z' }] })
    expect(screen.getByTestId('page-post-when')).toHaveTextContent('7:00–9:00pm')
  })
})
