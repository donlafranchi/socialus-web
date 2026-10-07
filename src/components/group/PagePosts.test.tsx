import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { PagePosts } from './PagePosts'
import { COPY } from '@/lib/copy'

// F072 — a Page owner announces something, with a time and a place on it.

const { searchPlacesAction } = vi.hoisted(() => ({ searchPlacesAction: vi.fn() }))
vi.mock('@/app/_actions/location-actions', () => ({
  searchPlacesAction,
  placeForPointAction: vi.fn(async () => ({ ok: true, data: { id: 'pl-curtis', name: 'Curtis Park' } })),
}))
vi.mock('@/lib/map-config', async (orig) => ({ ...(await orig<typeof import('@/lib/map-config')>()), mapAvailable: () => true }))
vi.mock('@/components/locations/PinAdjustMap', () => ({ PinAdjustMap: () => null }))
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
      startComposing
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

// The noun is Post (ruled 2026-10-05; tone approved 2026-10-06); the verb stays outward, Announce.
describe('the word', () => {
  it('heads the section Posts, never Announcements or bulletin', () => {
    const { container } = renderPosts({ posts: [POST] })
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/^Posts$/)
    expect((container.textContent ?? '').toLowerCase()).not.toContain('bulletin')
    expect(container.textContent).not.toMatch(/Announcements/)
  })

  it('names the primary control Announce', () => {
    renderPosts()
    expect(screen.getByTestId('page-post-send')).toHaveTextContent('Announce')
  })
})

// The reviewer's first pass on #472: the form is rarely used, so it opens from
// the owner's Announce (Google Business Profile's "Add update" opens on request).
describe('the composer opens from Announce', () => {
  afterEach(() => window.history.replaceState(null, '', '/'))

  it('is closed until asked for', () => {
    renderPosts({ startComposing: false, posts: [POST] })
    expect(screen.queryByTestId('page-post-body')).toBeNull()
  })

  it('opens when the page is opened at #announce', async () => {
    window.history.replaceState(null, '', '/g/x#announce')
    renderPosts({ startComposing: false })
    expect(await screen.findByTestId('page-post-body')).toBeInTheDocument()
  })

  it('opens when Announce is tapped on the same page', async () => {
    renderPosts({ startComposing: false })
    window.history.replaceState(null, '', '/g/x#announce')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(await screen.findByTestId('page-post-body')).toBeInTheDocument()
  })
})

// #462 — the PM, 2026-10-06: the latest three as cards in a row, newest on the
// left; See all posts opens the rest as a list, newest first (Google Business
// Profile's updates; Facebook Pages and Instagram keep the rest a tap away).
describe('#462 — the latest three in a row, then See all posts', () => {
  const five = ['2026-09-21', '2026-09-25', '2026-09-23', '2026-09-24', '2026-09-22'].map((d, i) =>
    postFixture({ id: `p-${d}`, body: `Post ${i}`, createdAt: `${d}T12:00:00.000Z`, updatedAt: `${d}T12:00:00.000Z` }),
  )
  const ids = (el: HTMLElement) => [...el.querySelectorAll('[data-testid="page-post"]')].map((li) => li.id.replace('announcement-', ''))

  it('shows the newest three in a row that scrolls inside its own section', () => {
    renderPosts({ canPost: false, posts: five })
    const row = screen.getByTestId('page-posts-latest')
    expect(ids(row)).toEqual(['p-2026-09-25', 'p-2026-09-24', 'p-2026-09-23'])
    expect(row.className).toMatch(/\boverflow-x-auto\b/)
    expect(row.className).toMatch(/\bflex\b/)
    expect(screen.queryByTestId('page-posts-all')).toBeNull()
  })

  it('See all posts opens every post as a list, newest first', () => {
    renderPosts({ canPost: false, posts: five })
    const more = screen.getByRole('button', { name: 'See all posts' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(more)
    const all = screen.getByTestId('page-posts-all')
    expect(ids(all)).toEqual(['p-2026-09-25', 'p-2026-09-24', 'p-2026-09-23', 'p-2026-09-22', 'p-2026-09-21'])
    expect(all.className).toMatch(/\bflex-col\b/)
    expect(screen.queryByTestId('page-posts-latest')).toBeNull()
  })

  it('three or fewer: the row, and nothing to see all of', () => {
    renderPosts({ canPost: false, posts: five.slice(0, 3) })
    expect(screen.getByTestId('page-posts-latest')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'See all posts' })).toBeNull()
  })

  it('a link to an older post still lands on it', async () => {
    window.history.replaceState(null, '', '/g/x-abc#announcement-p-2026-09-21')
    renderPosts({ canPost: false, posts: five })
    await waitFor(() => expect(document.getElementById('announcement-p-2026-09-21')).toHaveAttribute('data-highlighted', 'true'))
    window.history.replaceState(null, '', '/')
  })

  it('the owner edits in the list: Edit on a card opens it there', () => {
    renderPosts({ canPost: true, posts: five })
    fireEvent.click(screen.getAllByTestId('page-post-edit')[1]!)
    expect(screen.getByTestId('page-posts-all')).toBeInTheDocument()
    expect(screen.getByTestId('page-post-edit-body')).toHaveValue('Post 3')
  })
})

describe('a time on it', () => {
  it('sends what the creator typed as an instant in the metro’s zone', async () => {
    renderPosts()
    fireEvent.change(screen.getByTestId('page-post-body'), {
      target: { value: 'Bread class Thursday.' },
    })
    // #317 — a time is asked for, then typed over the defaults it fills.
    fireEvent.click(screen.getByTestId('announce-add-when'))
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
    // #317 — a time is asked for, then typed over the defaults it fills.
    fireEvent.click(screen.getByTestId('announce-add-when'))
    fireEvent.change(screen.getByTestId('announce-date'), { target: { value: '2026-09-24' } })
    fireEvent.change(screen.getByTestId('announce-time'), { target: { value: '' } })
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
    // #317 — a time is asked for, then typed over the defaults it fills.
    fireEvent.click(screen.getByTestId('announce-add-when'))
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

  // #317 — an end is filled an hour after the start; the owner can clear it.
  it('sends no end when the owner clears it', async () => {
    renderPosts()
    typeStart()
    fireEvent.change(screen.getByTestId('announce-end-time'), { target: { value: '' } })
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

// #348 — an event's own meet spot: "How to find us", beside its place.
describe('#348 — how to find us, on a post', () => {
  it('shows under when and where', () => {
    renderPosts({ posts: [{ ...postFixture(), howToFind: 'Meet at the boat ramp' }] })
    expect(screen.getByTestId('page-post-how')).toHaveTextContent('How to find us: Meet at the boat ramp')
  })

  it('the composer takes it once a place is being set, and sends it', async () => {
    renderPosts()
    fireEvent.change(screen.getByPlaceholderText('What do you want people to know?'), { target: { value: 'Float Saturday.' } })
    fireEvent.click(screen.getByTestId('announce-add-place'))
    fireEvent.change(screen.getByRole('textbox', { name: /how to find us/i }), { target: { value: 'Meet at the boat ramp' } })
    fireEvent.click(screen.getByTestId('page-post-send'))
    await waitFor(() => expect(onPost).toHaveBeenCalledWith(expect.objectContaining({ howToFind: 'Meet at the boat ramp' })))
  })
})

describe('#348 — an event at a dropped pin', () => {
  it('is named by what is around it, not "Pinned spot"', async () => {
    renderPosts()
    fireEvent.change(screen.getByPlaceholderText('What do you want people to know?'), { target: { value: 'Float Saturday.' } })
    fireEvent.click(screen.getByTestId('announce-add-place'))
    fireEvent.click(screen.getByRole('button', { name: /drop a pin instead/i }))
    fireEvent.click(screen.getByTestId('page-post-send'))
    await waitFor(() => expect(onCreateLocation).toHaveBeenCalledWith(expect.objectContaining({ label: 'Near Curtis Park' })))
  })
})

describe('#286 — tags on posts', () => {
  it('a new post carries the tags typed into it', async () => {
    renderPosts()
    fireEvent.change(screen.getByPlaceholderText('What do you want people to know?'), { target: { value: 'Concert Friday' } })
    fireEvent.change(screen.getByTestId('announce-tag-input'), { target: { value: 'concert,' } })
    fireEvent.click(screen.getByTestId('page-post-send'))
    await waitFor(() => expect(onPost).toHaveBeenCalledWith(expect.objectContaining({ tags: ['concert'] })))
  })

  it('an edit starts from the post\'s own tags and sends the new set', async () => {
    renderPosts({ posts: [postFixture({ tags: ['concert', 'jazz'] } as never)] })
    fireEvent.click(screen.getByTestId('page-post-edit'))
    fireEvent.click(screen.getByTestId('announce-edit-tag-remove-jazz'))
    fireEvent.click(screen.getByTestId('page-post-edit-save'))
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ tags: ['concert'] })))
  })
})
