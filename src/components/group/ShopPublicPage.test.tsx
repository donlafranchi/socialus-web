// T074 — Unit tests for <ShopPublicPage> (F035 read surface).
// Trace: planning/now/scenario-F035-rosa-finds-mayas-shop.md story beats 1–6.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }), usePathname: () => '/' }))
import '@testing-library/jest-dom/vitest'
import { ShopPublicPage } from './ShopPublicPage'
import type { ResolvedShop } from '@/lib/groups/resolve-shop'

afterEach(cleanup)

const SHOP: ResolvedShop = {
  groupId: 'grp-1',
  kind: 'business',
  slug: 'oak-park-sourdough',
  publicId: '7k3x8m',
  displayName: 'Oak Park Sourdough',
  publicDescription: 'Real bread, baked local.',
  lifecycleState: 'active',
  anchorLocationId: 'loc-1',
  purpose: 'sell',
  category: null,
  photoUrl: null,
  socialLinks: {},
  photoHiddenAt: null,
  photoRemovedAt: null,
  discoverability: 'listed',
  placements: [],
  unclaimed: null,
  founder: {
    handle: 'maya',
    displayName: 'Maya Rivera',
    avatarUrl: 'https://x/a.png',
    hasPublished: true,
  },
}

function renderShop(overrides: Partial<Parameters<typeof ShopPublicPage>[0]> = {}) {
  return render(
    <ShopPublicPage
      shop={SHOP}
      badge={null}
      items={[]}
      loggedIn={false}
      {...overrides}
    />,
  )
}

describe('ShopPublicPage — Beat 1 (header)', () => {
  it('leads with the brand label from group_businesses.display_name as the h1', () => {
    renderShop()
    const h1 = screen.getByTestId('shop-name')
    expect(h1.tagName).toBe('H1')
    expect(h1).toHaveTextContent('Oak Park Sourdough')
  })

  it('#303 — the founder is a name, never a link to a member profile; avatar is decorative', () => {
    renderShop()
    const founder = screen.getByTestId('shop-founder')
    expect(screen.queryByTestId('shop-founder-link')).not.toBeInTheDocument()
    expect(founder.querySelector('a')).toBeNull()
    expect(founder).toHaveTextContent('Maya Rivera')
    expect(founder.querySelector('img')).toHaveAttribute('alt', '')
  })

  it('T137 — renders the founder as plain text (no link) when hasPublished=false', () => {
    renderShop({
      shop: {
        ...SHOP,
        founder: { ...SHOP.founder!, hasPublished: false },
      },
    })
    const founder = screen.getByTestId('shop-founder')
    expect(founder).toHaveTextContent('Maya Rivera')
    expect(screen.queryByTestId('shop-founder-link')).not.toBeInTheDocument()
    expect(screen.getByTestId('shop-founder-text')).toBeInTheDocument()
    // Avatar still renders; just not inside a link.
    expect(founder.querySelector('img')).toHaveAttribute('alt', '')
  })

  it('renders the brand description when present and omits it when empty', () => {
    renderShop()
    expect(screen.getByText('Real bread, baked local.')).toBeInTheDocument()
    cleanup()
    renderShop({ shop: { ...SHOP, publicDescription: '' } })
    expect(screen.queryByText('Real bread, baked local.')).not.toBeInTheDocument()
  })

  it('renders without a founder block when the founder embed is absent', () => {
    renderShop({ shop: { ...SHOP, founder: null } })
    expect(screen.queryByTestId('shop-founder')).not.toBeInTheDocument()
    expect(screen.getByTestId('shop-name')).toBeInTheDocument()
  })
})

describe('ShopPublicPage — T159 (categories retired)', () => {
  it('shows no category chip and no free-text category line', () => {
    // Categories are retired; tags are the only vocabulary. Tags are NOT
    // shown here yet — a public tag is member-contributed content other
    // members see, which rule 1 bars from production until
    // report-and-takedown exists (#13).
    renderShop()
    expect(screen.queryByTestId('shop-category')).toBeNull()
    expect(screen.queryByTestId('shop-category-other')).toBeNull()
  })
})

describe('ShopPublicPage — T143 (where this Page currently resolves to)', () => {
  it('renders the resolved placement label when one exists', () => {
    renderShop({
      shop: {
        ...SHOP,
        placements: [
          { source: 'anchor', kind: 'point', label: '123 Main St, Sacramento, CA', lng: -121.5, lat: 38.58 },
        ],
      },
    })
    expect(screen.getByTestId('shop-placement')).toHaveTextContent('123 Main St, Sacramento, CA')
  })

  it('renders an area placement\'s Place name the same way', () => {
    renderShop({
      shop: { ...SHOP, placements: [{ source: 'anchor', kind: 'area', label: 'Midtown', lng: -121.48, lat: 38.57 }] },
    })
    expect(screen.getByTestId('shop-placement')).toHaveTextContent('Midtown')
  })

  it('renders nothing when there is no placement — no empty heading, no placeholder', () => {
    renderShop({ shop: { ...SHOP, placements: [] } })
    expect(screen.queryByTestId('shop-placement')).not.toBeInTheDocument()
  })
})

describe('ShopPublicPage — Beat 2 (local owner badge render path)', () => {
  it('renders the "Claimed local owner" badge when a badge is supplied', () => {
    renderShop({ badge: { label: 'Claimed local owner' } })
    const badge = screen.getByTestId('local-owner-badge')
    expect(badge).toHaveTextContent('Claimed local owner')
  })

  it('renders no badge (no negative space) when none is supplied', () => {
    renderShop({ badge: null })
    expect(screen.queryByTestId('local-owner-badge')).not.toBeInTheDocument()
  })
})

describe('ShopPublicPage — Beat 3 (items empty state)', () => {
  it('shows a visible empty state, not a hidden section, when there are no items', () => {
    renderShop({ items: [], loggedIn: true })
    const empty = screen.getByTestId('shop-items-empty')
    expect(empty).toBeInTheDocument()
    expect(empty).toHaveTextContent(/check back soon/i)
    // voice-and-tone.md: no em dashes, anywhere.
    expect(empty.textContent).not.toContain('\u2014')
  })

  it('lists items when present', () => {
    renderShop({ items: [{ id: 'i1', title: 'Country Loaf', kind: 'product' }], loggedIn: true })
    expect(screen.queryByTestId('shop-items-empty')).not.toBeInTheDocument()
    expect(screen.getByText('Country Loaf')).toBeInTheDocument()
  })
})

describe('ShopPublicPage — Beat 6 (draft owner preview)', () => {
  // #301 — the walkthrough is retired; the draft is finished on the Page.
  it('shows the draft banner for a draft row, with no way back to the walkthrough', () => {
    renderShop({ shop: { ...SHOP, lifecycleState: 'draft' } })
    const banner = screen.getByTestId('shop-draft-banner')
    expect(banner).toHaveTextContent(/draft/i)
    expect(banner.querySelector('a[href="/you/sell"]')).toBeNull()
  })

  it('shows no draft banner for an active shop', () => {
    renderShop()
    expect(screen.queryByTestId('shop-draft-banner')).not.toBeInTheDocument()
  })
})

// F067 replaced the placeholder button. The old Beats 4 & 5 tests asserted
// that following was "coming soon" and that the label read "Follow {name}";
// both describe behaviour that no longer exists. What survives is the beat
// itself: a signed-out viewer gets a way in, a signed-in one gets the control.
// The control's own behaviour is covered in FollowPageButton.test.tsx.

describe('F035 Beats 4 & 5 — the follow control is present for both viewers', () => {
  it('Beat 5: a signed-out viewer gets a way to sign in', () => {
    renderShop({ loggedIn: false })
    expect(screen.getByTestId('page-follow-signin')).toBeInTheDocument()
    expect(screen.queryByTestId('page-follow')).not.toBeInTheDocument()
  })

  it('Beat 4: a signed-in viewer gets the control itself', () => {
    renderShop({ loggedIn: true })
    expect(screen.getByTestId('page-follow')).toBeInTheDocument()
    expect(screen.queryByTestId('page-follow-signin')).not.toBeInTheDocument()
  })

  it('a private Page is joined, not followed', () => {
    renderShop({ loggedIn: true, shop: { ...SHOP, discoverability: 'private' } })
    expect(screen.getByTestId('page-follow')).toHaveTextContent(/^Join$/)
  })
})

// ---------------------------------------------------------------------------
// T160 (Issue #62) — the report control, and what the owner sees.
// Trace: planning/scenario-F058.md acceptance 1 and 2.

describe('T160 — the report control on the Page surface', () => {
  it('every viewer but the owner gets the ⋯ control, signed in or not', () => {
    renderShop()
    expect(screen.getByRole('button', { name: 'More options' })).toBeInTheDocument()
    cleanup()
    renderShop({ loggedIn: true })
    expect(screen.getByRole('button', { name: 'More options' })).toBeInTheDocument()
  })
})

describe('T160 — what the owner sees when their photo is hidden', () => {
  const HIDDEN: ResolvedShop = { ...SHOP, photoUrl: 'https://x/p.jpg', photoHiddenAt: '2026-09-14T00:00:00Z' }

  it('the owner sees the notice in the photo\'s frame', () => {
    renderShop({ shop: HIDDEN, loggedIn: true, viewerOwnsPage: true })
    expect(screen.getByTestId('hidden-photo-notice')).toBeInTheDocument()
  })

  it('a signed-in non-owner does not', () => {
    renderShop({ shop: HIDDEN, loggedIn: true, viewerOwnsPage: false })
    expect(screen.queryByTestId('hidden-photo-notice')).not.toBeInTheDocument()
  })

  it('an anonymous viewer does not', () => {
    renderShop({ shop: HIDDEN, loggedIn: false, viewerOwnsPage: false })
    expect(screen.queryByTestId('hidden-photo-notice')).not.toBeInTheDocument()
  })

  it('a non-owner sees exactly what a Page with no photo sees — no photo, and no hint one exists', () => {
    const { container } = renderShop({ shop: HIDDEN, loggedIn: true, viewerOwnsPage: false })
    expect(container.querySelector('img[src="https://x/p.jpg"]')).toBeNull()
    expect(container.textContent ?? '').not.toMatch(/hidden|reported|reviewing/i)
  })

  it('the owner of a Page whose photo is NOT hidden sees no notice', () => {
    renderShop({
      shop: { ...SHOP, photoUrl: 'https://x/p.jpg', photoHiddenAt: null },
      loggedIn: true,
      viewerOwnsPage: true,
    })
    expect(screen.queryByTestId('hidden-photo-notice')).not.toBeInTheDocument()
  })

  it('the notice never carries a reporter or a report body', () => {
    renderShop({ shop: HIDDEN, loggedIn: true, viewerOwnsPage: true })
    const text = screen.getByTestId('hidden-photo-notice').textContent ?? ''
    expect(text).not.toMatch(/report(ed )?by|from [A-Z]/)
    expect(text).not.toMatch(/@|\bsaid\b/)
  })
})

describe('F070 — links out', () => {
  it('renders nothing when the Page has no links', () => {
    renderShop({ shop: { ...SHOP, socialLinks: {} } })
    expect(screen.queryByTestId('shop-social-links')).toBeNull()
  })

  it('renders a link per platform, off-platform and safely', () => {
    renderShop({ shop: { ...SHOP, socialLinks: { instagram: 'https://instagram.com/claras' } }, loggedIn: true })
    const a = screen.getByTestId('shop-social-instagram')
    expect(a).toHaveAttribute('href', 'https://instagram.com/claras')
    expect(a).toHaveAttribute('rel', 'noopener noreferrer')
  })

  // The one that matters. A row that predates the CHECK, or anything that
  // bypassed the action layer, must not reach an href.
  it('withholds a link that is not https, rather than rendering it', () => {
    renderShop({ shop: { ...SHOP, socialLinks: { instagram: 'javascript:alert(1)' } as never }, loggedIn: true })
    expect(screen.queryByTestId('shop-social-instagram')).toBeNull()
    expect(screen.queryByTestId('shop-social-links')).toBeNull()
  })
})

// F093 — which announcements list a Page shows depends on who is reading.
describe('F093 — the Page, signed out', () => {
  const withheld = [
    {
      resultKind: 'post',
      resultId: 'p-1',
      withheld: true,
      announcementCount: 2,
    },
  ] as unknown as Parameters<typeof ShopPublicPage>[0]['withheldPosts']

  it('shows the withheld announcements to a signed-out visitor', () => {
    renderShop({ loggedIn: false, withheldPosts: withheld })
    expect(screen.getByTestId('page-posts-withheld')).toBeInTheDocument()
  })

  it('does not also show the readable list', () => {
    // Both at once would mean two Announcements headings and two anchors with
    // the same id — the fragment would land on whichever rendered first.
    renderShop({ loggedIn: false, withheldPosts: withheld })
    expect(screen.queryByTestId('page-posts')).not.toBeInTheDocument()
  })

  it('shows the readable list to a signed-in member — criterion 6', () => {
    renderShop({ loggedIn: true, posts: [], viewerOwnsPage: true })
    expect(screen.getByTestId('page-posts')).toBeInTheDocument()
    expect(screen.queryByTestId('page-posts-withheld')).not.toBeInTheDocument()
  })
})

// #267 — a Page's owner sees neither Follow nor Report on their own Page.
// Unfollowing ran group.unfollow on the row that holds their authority.
describe('#267 — the owner on their own Page', () => {
  it('sees no follow control, even though their own row reads as following', () => {
    renderShop({ loggedIn: true, viewerOwnsPage: true, viewerFollows: true })
    expect(screen.queryByTestId('page-follow')).toBeNull()
    expect(screen.queryByTestId('page-follow-signin')).toBeNull()
  })

  it('sees no report control', () => {
    renderShop({ loggedIn: true, viewerOwnsPage: true })
    expect(screen.queryByRole('button', { name: 'More options' })).toBeNull()
  })

  it('a signed-in visitor who does not own it still sees both', () => {
    renderShop({ loggedIn: true, viewerOwnsPage: false })
    expect(screen.getByTestId('page-follow')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More options' })).toBeInTheDocument()
  })
})

describe('#300 — the Page on the new layout', () => {
  it('shows its photo as the cover', () => {
    renderShop({ shop: { ...SHOP, photoUrl: 'https://example.test/p.jpg', photoHiddenAt: null } })
    expect(screen.getByTestId('page-cover').querySelector('img')).toHaveAttribute('src', 'https://example.test/p.jpg')
  })

  it('shows default art when there is no photo, or it is hidden', () => {
    renderShop({ shop: { ...SHOP, photoUrl: null } })
    expect(screen.getByTestId('page-cover').querySelector('[data-testid="default-art"]')).not.toBeNull()
    cleanup()
    renderShop({ shop: { ...SHOP, photoUrl: 'https://example.test/p.jpg', photoHiddenAt: '2026-10-01T00:00:00Z' } })
    expect(screen.getByTestId('page-cover').querySelector('img')).toBeNull()
  })

  it('shows default art when the operator removed the photo', () => {
    renderShop({ shop: { ...SHOP, photoUrl: 'https://example.test/p.jpg', photoRemovedAt: '2026-10-01T00:00:00Z' } })
    expect(screen.getByTestId('page-cover').querySelector('img')).toBeNull()
  })

  it('gives the owner a panel beside the Page on a laptop, with Edit', () => {
    renderShop({ viewerOwnsPage: true, pagePath: '/g/x-abc123' })
    const panel = screen.getByTestId('owner-panel')
    expect(panel.className).toMatch(/\bhidden\b/)
    expect(panel.className).toMatch(/\blg:block\b/)
    expect(panel.querySelector('[data-testid="owner-edit-toggle"]')).not.toBeNull()
  })

  it('gives nobody else a panel', () => {
    renderShop({ viewerOwnsPage: false })
    expect(screen.queryByTestId('owner-panel')).toBeNull()
  })
})

describe('#301 — the draft Page, in the owner view', () => {
  const draft = { ...SHOP, lifecycleState: 'draft' as const, displayName: 'untitled-draft', anchorLocationId: null, publicDescription: '' }

  it('says it is a draft only you can see, and offers Before you publish', () => {
    renderShop({ shop: draft, viewerOwnsPage: true, pagePath: '/g/draft-x' })
    expect(screen.getByTestId('shop-draft-banner')).toHaveTextContent(/draft.*only you can see this/i)
    expect(screen.getByTestId('before-you-publish')).toBeInTheDocument()
    expect(screen.queryByText(/resume walkthrough/i)).toBeNull()
  })

  it('calls an unnamed draft by its kind, never by the placeholder', () => {
    renderShop({ shop: draft, viewerOwnsPage: true, pagePath: '/g/draft-x' })
    expect(screen.getByTestId('shop-name')).toHaveTextContent('Your new business Page')
    expect(screen.queryByText('untitled-draft')).toBeNull()
  })

  it('names a group draft specifically, not "group" alone', () => {
    renderShop({ shop: { ...draft, kind: 'group', purpose: 'gather' }, viewerOwnsPage: true, pagePath: '/g/draft-x' })
    expect(screen.getByTestId('shop-name')).toHaveTextContent('Your new group or meetup Page')
  })

  it('knows what is done', () => {
    renderShop({ shop: { ...draft, displayName: 'Oak Park Sourdough', anchorLocationId: 'loc-1' }, viewerOwnsPage: true, pagePath: '/g/draft-x' })
    expect(screen.getByTestId('publish-item-name')).toHaveAttribute('data-done', 'true')
    expect(screen.getByTestId('publish-item-where')).toHaveAttribute('data-done', 'true')
    expect(screen.getByTestId('publish-item-description')).toHaveAttribute('data-done', 'false')
  })
})

describe('#300 — the front door, signed out (F093 criterion 8)', () => {
  const items = [{ id: 'i1', title: 'Country Loaf', kind: 'product' as const }]
  const socialLinks = { instagram: 'https://instagram.com/claras' }

  it('shows no listings and no links out signed out', () => {
    renderShop({ shop: { ...SHOP, socialLinks }, items, loggedIn: false })
    expect(screen.queryByText('Products & services')).toBeNull()
    expect(screen.queryByText('Country Loaf')).toBeNull()
    expect(screen.queryByTestId('shop-social-links')).toBeNull()
  })

  it('shows both once signed in', () => {
    renderShop({ shop: { ...SHOP, socialLinks }, items, loggedIn: true })
    expect(screen.getByText('Country Loaf')).toBeInTheDocument()
    expect(screen.getByTestId('shop-social-links')).toBeInTheDocument()
  })

  it('names the Page, not a Shop or its founder, when nothing is listed', () => {
    renderShop({ items: [], loggedIn: true })
    const empty = screen.getByTestId('shop-items-empty')
    expect(empty).toHaveTextContent("This Page hasn't listed anything yet")
    expect(empty.textContent).not.toMatch(/Shop|Maya/)
  })

  it('centres the column for a visitor; only the owner gets the two-column grid', () => {
    const { container, unmount } = renderShop({ loggedIn: true })
    expect(container.querySelector('main')!.className).not.toMatch(/lg:grid/)
    unmount()
    const owner = renderShop({ loggedIn: true, viewerOwnsPage: true, pagePath: '/g/x-abc123' })
    expect(owner.container.querySelector('main')!.className).toMatch(/lg:grid/)
  })
})

describe('#316 — a Page shows its tags as #hashtags, signed in only', () => {
  it('signed in, each tag is a chip', () => {
    renderShop({ loggedIn: true, tags: ['Sourdough'] })
    expect(screen.getByRole('link', { name: '#Sourdough' })).toBeInTheDocument()
  })
  it('sit under the description, like hashtags under a post', () => {
    renderShop({ loggedIn: true, tags: ['Sourdough'] })
    const desc = screen.getByText('Real bread, baked local.')
    expect(desc.compareDocumentPosition(screen.getByTestId('tag-chips')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('signed out, none, even if handed some', () => {
    renderShop({ loggedIn: false, tags: ['Sourdough'] })
    expect(screen.queryByTestId('tag-chips')).toBeNull()
  })
})

describe('#293 — phone and hours on the Page', () => {
  it('shows them to a signed-in visitor', () => {
    renderShop({ loggedIn: true, contact: { phone: '+19165550142', hours: null } })
    expect(screen.getByTestId('page-phone')).toHaveAttribute('href', 'tel:+19165550142')
  })

  it('shows nothing signed out, even if handed them', () => {
    renderShop({ loggedIn: false, contact: { phone: '+19165550142', hours: null } })
    expect(screen.queryByTestId('page-contact')).toBeNull()
  })
})


// #302 — edit in place, by section (Don, 2026-10-04).
describe('#302 — the owner edits the Page in place', () => {
  it('Edit shows a small edit button on each section', () => {
    renderShop({ loggedIn: true, viewerOwnsPage: true, pagePath: '/g/x-abc123', viewerMemberId: 'm1', tags: ['sourdough'] })
    expect(screen.queryByTestId('edit-section-about')).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]!)
    for (const s of ['about', 'photo', 'where', 'tags', 'links', 'components']) {
      expect(screen.getAllByTestId(`edit-section-${s}`).length).toBeGreaterThan(0)
    }
  })

  it('a visitor never sees them', () => {
    renderShop({ loggedIn: true, viewerOwnsPage: false })
    expect(screen.queryByTestId('owner-edit-toggle')).toBeNull()
    expect(screen.queryByTestId('edit-section-about')).toBeNull()
  })
})

describe('#348 — where it is, under the location', () => {
  const where = { mode: 'visit' as const, howToFind: 'Trailhead behind the barn', usuallyAround: null, towns: [] }
  it('a signed-in visitor reads how to find it', () => {
    renderShop({ loggedIn: true, where })
    expect(screen.getByTestId('shop-where')).toHaveTextContent('How to find us: Trailhead behind the barn')
  })
  it('signed out, nothing, even if handed it', () => {
    renderShop({ loggedIn: false, where })
    expect(screen.queryByTestId('shop-where')).toBeNull()
  })
})

// Don, 2026-10-05: the local-owner badge and its question belong to business
// kinds (shop, service), never to social groups.
describe('Locally owned is for businesses only', () => {
  const badge = { label: 'Locally owned' } as never
  const claim = { zip: null } as never
  it('a social group shows neither the badge nor the question, even if handed them', () => {
    renderShop({ shop: { ...SHOP, kind: 'group', purpose: 'gather' }, badge, ownerClaim: claim, viewerOwnsPage: true, pagePath: '/g/x-abc123', loggedIn: true })
    expect(screen.queryByTestId('local-owner-badge')).toBeNull()
    expect(screen.queryByText(/locally owned claim/i)).toBeNull()
  })
  it('a shop still shows the badge', () => {
    renderShop({ shop: { ...SHOP, kind: 'business' }, badge, loggedIn: true })
    expect(screen.getByTestId('local-owner-badge')).toBeInTheDocument()
  })
})


// #363 — an unnamed draft is called by its use case.
describe('#363 — draft heading by purpose', () => {
  it('a Be creative draft reads "Your new Page"', () => {
    renderShop({ shop: { ...SHOP, kind: 'group', purpose: 'create', lifecycleState: 'draft', displayName: 'untitled-draft', anchorLocationId: null, publicDescription: '' }, viewerOwnsPage: true, pagePath: '/g/draft-x' })
    expect(screen.getByTestId('shop-name')).toHaveTextContent(/^Your new Page$/)
  })
})

// #363 — two types (ruled 2026-10-05): the kind line under the name, and the
// type sets what leads. Precedent: Meetup (Join, next event), Google Business
// Profile (Call).
describe('#363 — the kind line and what each type leads with', () => {
  const soon = new Date(Date.now() + 2 * 864e5).toISOString()
  const later = new Date(Date.now() + 9 * 864e5).toISOString()
  const post = (id: string, body: string, startsAt: string | null) => ({ id, body, createdAt: soon, updatedAt: soon, startsAt, endsAt: null, locationLabel: null })
  const posts = [post('p-later', 'Star party', later), post('p-note', 'Thanks all', null), post('p-soon', 'Float day', soon)]
  const GROUP = { ...SHOP, kind: 'group', purpose: 'gather', category: null }

  it('says type · purpose under the name, or type · collection', () => {
    renderShop({ loggedIn: true, shop: GROUP })
    expect(screen.getByTestId('page-kind')).toHaveTextContent('Social group · Meets up')
    cleanup()
    renderShop({ loggedIn: true, shop: { ...SHOP, category: 'Bakery' } })
    expect(screen.getByTestId('page-kind')).toHaveTextContent('Business · Bakery')
  })

  it('a group: Join, its next event, and no products & services until added', () => {
    renderShop({ loggedIn: true, shop: GROUP, posts })
    expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument()
    expect(screen.getByTestId('page-next-up')).toHaveTextContent(/next event/i)
    expect(screen.getByTestId('page-next-up')).toHaveTextContent('Float day')
    expect(screen.getByTestId('page-next-up')).not.toHaveTextContent('Star party')
    expect(screen.queryByRole('heading', { name: /products/i })).toBeNull()
    cleanup()
    renderShop({ loggedIn: true, shop: GROUP, productsOn: true })
    expect(screen.getByRole('heading', { name: /products/i })).toBeInTheDocument()
  })

  it('a business leads with how to reach it: contact before the description', () => {
    renderShop({ loggedIn: true, contact: { phone: '+19165550142', hours: null } as never })
    const contact = screen.getByTestId('page-contact')
    expect(contact.compareDocumentPosition(screen.getByText(SHOP.publicDescription)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByTestId('page-next-up')).toBeNull()
  })
})

describe('ShopPublicPage — #353 an unclaimed Page', () => {
  const UNCLAIMED: ResolvedShop = {
    ...SHOP,
    photoUrl: 'https://x/cover.webp',
    founder: null,
    unclaimed: { publicInfoUrl: 'https://bakery.example', photoCredit: 'Bakery (from their website)', photoSourceUrl: 'https://bakery.example/about' },
  }

  it('labels it, credits the picture and the description, and ends with Claim and Remove', () => {
    renderShop({ shop: UNCLAIMED })
    expect(screen.getByTestId('unclaimed-label')).toHaveTextContent('Unclaimed: added from public info')
    expect(screen.getByTestId('photo-credit').querySelector('a')).toHaveAttribute('href', 'https://bakery.example/about')
    expect(screen.getByTestId('description-credit')).toHaveAttribute('href', 'https://bakery.example')
    expect(screen.getByTestId('unclaimed-claim')).toBeInTheDocument()
    expect(screen.getByTestId('unclaimed-remove')).toBeInTheDocument()
    expect(screen.queryByTestId('shop-founder')).toBeNull()
  })

  it('shows none of it on a member-made Page', () => {
    renderShop()
    for (const id of ['unclaimed-label', 'photo-credit', 'description-credit', 'unclaimed-box']) {
      expect(screen.queryByTestId(id)).toBeNull()
    }
  })
})

describe('ShopPublicPage — #409 Share', () => {
  it('is there for everyone on a published Page, signed in or out', () => {
    for (const loggedIn of [false, true]) {
      renderShop({ loggedIn, pagePath: '/g/oak-park-sourdough-7k3x8m' })
      expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
      cleanup()
    }
  })

  it('is not on a draft', () => {
    renderShop({ shop: { ...SHOP, lifecycleState: 'draft' }, viewerOwnsPage: true, pagePath: '/g/oak-park-sourdough-7k3x8m' })
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
  })
})
