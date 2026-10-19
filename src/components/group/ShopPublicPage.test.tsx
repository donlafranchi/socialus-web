// T074 — Unit tests for <ShopPublicPage> (F035 read surface).
// Trace: planning/now/scenario-F035-rosa-finds-mayas-shop.md story beats 1–6.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }), usePathname: () => '/' }))
import '@testing-library/jest-dom/vitest'
import { ShopPublicPage } from './ShopPublicPage'
import type { ResolvedShop } from '@/lib/groups/resolve-shop'

afterEach(cleanup)

const LOAF = { id: 'i1', kind: 'product' as const, name: 'Country Loaf', details: '', priceCents: null, inStock: true, photoUrl: null, sampleSourceUrl: null, hidden: false }

const SHOP: ResolvedShop = {
  groupId: 'grp-1',
  kind: 'business',
  slug: 'oak-park-sourdough',
  publicId: '7k3x8m',
  displayName: 'Oak Park Sourdough',
  publicDescription: 'Real bread, baked local.',
  wordsHidden: false,
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
      loggedIn: true,
    })
    expect(screen.getByTestId('shop-placement')).toHaveTextContent('123 Main St, Sacramento, CA')
  })

  // F093 criterion 8 (amended 2026-09-30): signed out sees no location.
  it('shows none of it signed out', () => {
    renderShop({ shop: { ...SHOP, placements: [{ source: 'anchor', kind: 'point', label: '123 Main St', lng: -121.5, lat: 38.58 }] } })
    expect(screen.queryByTestId('shop-placement')).toBeNull()
  })

  it('renders an area placement\'s Place name the same way', () => {
    renderShop({
      shop: { ...SHOP, placements: [{ source: 'anchor', kind: 'area', label: 'Midtown', lng: -121.48, lat: 38.57 }] },
      loggedIn: true,
    })
    expect(screen.getByTestId('shop-placement')).toHaveTextContent('Midtown')
  })

  // #894 — "It moves" and "I go to them" anchor to the metro, whose centre falls in East Sacramento: no fixed neighbourhood, no map.
  it.each([
    ['roaming', 'Around the Sacramento area, usually Midtown markets'],
    ['travel', 'Comes to you anywhere in the Sacramento area'],
  ] as const)('a Page that is %s shows only its own line, never the anchor\'s neighbourhood', (mode, line) => {
    renderShop({
      shop: { ...SHOP, placements: [{ source: 'anchor', kind: 'area', label: 'East Sacramento', lng: -121.46, lat: 38.56 }] },
      where: { mode, howToFind: null, usuallyAround: mode === 'roaming' ? 'Midtown markets' : null, towns: [] },
      loggedIn: true,
    })
    expect(screen.queryByTestId('shop-placement')).toBeNull()
    expect(screen.queryByText('East Sacramento')).toBeNull()
    expect(screen.getByTestId('shop-where')).toHaveTextContent(line)
  })

  it('renders nothing when there is no placement — no empty heading, no placeholder', () => {
    renderShop({ shop: { ...SHOP, placements: [] } })
    expect(screen.queryByTestId('shop-placement')).not.toBeInTheDocument()
  })
})

describe('ShopPublicPage — Beat 2 (local owner badge render path)', () => {
  it('renders the "Claimed local owner" badge when a badge is supplied', () => {
    renderShop({ badge: { label: 'Claimed local owner' } })
    expect(screen.getByTestId('local-owner-badge')).toHaveTextContent('Claimed local owner')
  })

  it('renders no badge (no negative space) when none is supplied', () => {
    renderShop({ badge: null })
    expect(screen.queryByTestId('local-owner-badge')).not.toBeInTheDocument()
  })
})

describe('ShopPublicPage — Beat 3 (items)', () => {
  // #909 (Don, 2026-10-18) — empty, the section is hidden from visitors and is the owner's prompt.
  it('hides an empty section from a visitor', () => {
    renderShop({ items: [], loggedIn: true })
    expect(screen.queryByRole('heading', { name: /products/i })).toBeNull()
  })

  it("an empty section asks the owner for the first one", () => {
    renderShop({ items: [], loggedIn: true, viewerOwnsPage: true, pagePath: '/g/x', viewerMemberId: 'm' })
    expect(screen.getByRole('heading', { name: /products/i })).toBeInTheDocument()
    expect(screen.getByTestId('featured-empty-owner')).toBeInTheDocument()
  })

  // bug #341 — a private family Page shows no card until its owner adds one (#363's ruling).
  it('a private group Page shows none by default', () => {
    renderShop({ shop: { ...SHOP, kind: 'group', purpose: 'gather', discoverability: 'private' }, loggedIn: true })
    expect(screen.queryByRole('heading', { name: /products/i })).toBeNull()
  })

  it('lists items when present', () => {
    renderShop({ items: [LOAF], loggedIn: true })
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
    expect(screen.queryByTestId('shop-archived-banner')).not.toBeInTheDocument()
  })

  // #423 — only the owner reaches an archived Page; it says so.
  it('tells the owner an archived Page is hidden', () => {
    renderShop({ shop: { ...SHOP, lifecycleState: 'archived' }, viewerOwnsPage: true, pagePath: '/g/x' })
    expect(screen.getByTestId('shop-archived-banner')).toHaveTextContent('Archived · Only you can see this')
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

  it('gives the owner a panel beside the Page on a laptop, with the Edit pencil', () => {
    renderShop({ viewerOwnsPage: true, pagePath: '/g/x-abc123' })
    const panel = screen.getByTestId('owner-panel')
    expect(panel.className).toMatch(/\bhidden\b/)
    expect(panel.className).toMatch(/\blg:block\b/)
    expect(panel.querySelector('a[aria-label="Edit Page"]')).toHaveAttribute('href', '/g/x-abc123/edit')
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
  const items = [LOAF]
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


// #412 — the PM, 2026-10-06: the owner edits on the Edit Page's cards; the
// Page itself carries no edit buttons sprinkled through it.
describe('#412 — the owner edits from the Edit Page, not in place', () => {
  it('the Page has Edit links to the Edit Page, and no section edit buttons', () => {
    renderShop({ loggedIn: true, viewerOwnsPage: true, pagePath: '/g/x-abc123', viewerMemberId: 'm1', tags: ['sourdough'] })
    const edits = screen.getAllByRole('link', { name: 'Edit Page' })
    expect(edits.length).toBeGreaterThan(0)
    for (const e of edits) expect(e).toHaveAttribute('href', '/g/x-abc123/edit')
    expect(screen.queryByRole('button', { name: /^edit/i })).toBeNull()
    expect(document.querySelector('[data-testid^="edit-section-"]')).toBeNull()
  })

  it('a visitor sees no Edit at all', () => {
    renderShop({ loggedIn: true, viewerOwnsPage: false })
    expect(screen.queryByTestId('owner-edit')).toBeNull()
    expect(screen.queryByRole('link', { name: /^Edit/ })).toBeNull()
  })

  it("a draft's checklist still opens the section it names", () => {
    const draft = { ...SHOP, lifecycleState: 'draft' as const, displayName: 'untitled-draft', anchorLocationId: null, publicDescription: '' }
    renderShop({ shop: draft, loggedIn: true, viewerOwnsPage: true, pagePath: '/g/draft-x', viewerMemberId: 'm1' })
    fireEvent.click(screen.getByRole('button', { name: /^add\s*description/i }))
    expect(screen.getByRole('dialog', { name: 'Description' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: /^add\s*name/i }))
    expect(screen.getByTestId('edit-name')).toHaveValue('')
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
    renderShop({ loggedIn: true, shop: GROUP, productsOn: true, items: [LOAF] })
    expect(screen.getByRole('heading', { name: /products/i })).toBeInTheDocument()
  })

  // bug #341 — a private family Page lists nothing unless its owner adds Products & services
  // (2026-10-05: the type sets the defaults; any Page can add any component).
  it('a private family Page shows no Products & services card, to its owner or its members', () => {
    const FAMILY = { ...GROUP, discoverability: 'private' } as typeof GROUP
    renderShop({ loggedIn: true, shop: FAMILY, viewerOwnsPage: true })
    expect(screen.queryByRole('heading', { name: /products/i })).toBeNull()
    expect(screen.queryByTestId('shop-items-empty')).toBeNull()
    cleanup()
    renderShop({ loggedIn: true, shop: FAMILY })
    expect(screen.queryByRole('heading', { name: /products/i })).toBeNull()
  })

  // #458 (the PM, 2026-10-06) set one order for every Page: About, Location, Contact.
  it('a business shows how to reach it in its Contact section, and no next event', () => {
    renderShop({ loggedIn: true, contact: { phone: '+19165550142', hours: null } as never })
    expect(screen.getByTestId('page-section-contact')).toContainElement(screen.getByTestId('page-contact'))
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

// #458 — the PM, 2026-10-06: a header block, then titled, contained sections
// (Google Business Profile's listing, Airbnb's listing page, a Facebook Page).
describe('#458 — a header block, then contained sections', () => {
  const where = { mode: 'visit' as const, howToFind: 'Side door', usuallyAround: null, towns: [] }
  const full = {
    loggedIn: true,
    pagePath: '/g/7k3x8m',
    where,
    tags: ['sourdough'],
    contact: { phone: '+19165550142', hours: null } as never,
    shop: { ...SHOP, placements: [{ source: 'anchor' as const, kind: 'point' as const, label: '3117 Broadway', lng: -121.47, lat: 38.55 }], socialLinks: { instagram: 'https://instagram.com/oakpark' } },
    items: [LOAF],
    posts: [{ id: 'p1', body: 'Bread', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', startsAt: null, endsAt: null, locationLabel: null }],
  }
  const sections = () => [...document.querySelectorAll('main section[data-section]')].map((el) => el.getAttribute('data-section'))

  it('the header holds the photo, name, kind, Share and Follow', () => {
    renderShop(full)
    const header = screen.getByTestId('page-header')
    for (const id of ['page-cover', 'shop-name', 'page-kind']) expect(header).toContainElement(screen.getByTestId(id))
    expect(header).toContainElement(screen.getByRole('button', { name: 'Share' }))
    expect(header).toContainElement(screen.getByRole('button', { name: /follow/i }))
  })

  it('then About, Location, Contact, Tags and Posts, each titled and contained', () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'pk.test')
    renderShop(full)
    expect(sections()).toEqual(['about', 'location', 'contact', 'found', 'posts', 'products'])
    for (const el of document.querySelectorAll('main section[data-section]')) {
      expect(el.querySelector('h2')).not.toBeNull()
      expect(el.className).toMatch(/\bcard\b/)
    }
    expect(screen.getByRole('heading', { level: 2, name: 'Tags' })).toBeInTheDocument()
    vi.unstubAllEnvs()
  })

  it('nothing loose between the header and the sections', () => {
    renderShop(full)
    const header = screen.getByTestId('page-header')
    for (const id of ['shop-placement', 'shop-where', 'page-contact', 'tag-chips', 'shop-social-links']) {
      const el = screen.getByTestId(id)
      expect(header).not.toContainElement(el)
      expect(el.closest('section[data-section]')).not.toBeNull()
    }
  })

  it('Location: where it is, how to find it, and a small map at the pin', () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'pk.test')
    renderShop(full)
    const loc = screen.getByTestId('page-section-location')
    expect(loc).toHaveTextContent('3117 Broadway')
    expect(loc).toHaveTextContent('How to find us: Side door')
    const map = within(loc).getByRole('img', { name: 'Map of 3117 Broadway' })
    expect(map.getAttribute('src')).toContain('-121.47,38.55')
    vi.unstubAllEnvs()
  })

  it('signed out: About and Posts only — no location, map, contact or tags', () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'pk.test')
    renderShop({ ...full, loggedIn: false, withheldPosts: [] })
    expect(sections()).not.toContain('location')
    expect(sections()).not.toContain('contact')
    expect(sections()).not.toContain('found')
    expect(document.querySelector('img[src*="mapbox"]')).toBeNull()
    vi.unstubAllEnvs()
  })

  it('a long About is collapsed, with More to open it', () => {
    renderShop({ ...full, shop: { ...full.shop, publicDescription: 'Bread. '.repeat(80) } })
    const about = screen.getByTestId('page-section-about')
    const more = within(about).getByRole('button', { name: 'More' })
    expect(about.querySelector('[data-testid="page-about-text"]')!.className).toMatch(/\bline-clamp-/)
    fireEvent.click(more)
    expect(about.querySelector('[data-testid="page-about-text"]')!.className).not.toMatch(/\bline-clamp-/)
  })

  it('a short About has nothing to open', () => {
    renderShop(full)
    expect(within(screen.getByTestId('page-section-about')).queryByRole('button', { name: 'More' })).toBeNull()
  })

  // bug #339 — never the literal placeholder "a location".
  it('a placement with no words shows no empty line', () => {
    renderShop({ ...full, shop: { ...full.shop, placements: [{ ...full.shop.placements[0]!, label: '' }] } })
    expect(screen.queryByTestId('shop-placement')).toBeNull()
    expect(document.body.textContent).not.toMatch(/a location/)
  })
})

// bug #338 — a member's row is membership, not a follow: nothing offers to undo it.
describe('#338 — a member of an open Page', () => {
  it('sees Member, not a Following toggle', () => {
    renderShop({ loggedIn: true, viewerFollows: true, viewerIsMember: true })
    expect(screen.queryByRole('button', { name: /following/i })).toBeNull()
    expect(screen.getByTestId('viewer-member')).toHaveTextContent('Member')
  })
  it('a follower still gets Following', () => {
    renderShop({ loggedIn: true, viewerFollows: true, viewerIsMember: false })
    expect(screen.getByRole('button', { name: /following/i })).toBeInTheDocument()
  })
})

describe('#472 first pass — nothing loose', () => {
  it('the next event sits in its own card', () => {
    const soon = new Date(Date.now() + 864e5).toISOString()
    renderShop({ loggedIn: true, shop: { ...SHOP, kind: 'group', purpose: 'gather' }, posts: [{ id: 'p', body: 'Float', createdAt: soon, updatedAt: soon, startsAt: soon, endsAt: null, locationLabel: null }] })
    expect(screen.getByTestId('page-next-up').className).toMatch(/\bcard\b/)
  })

  it('the founder line says what it is', () => {
    renderShop({ loggedIn: true })
    expect(screen.getByTestId('shop-founder')).toHaveTextContent('Started by Maya Rivera')
  })
})

// #625 — the owner of a Page whose words a report hid sees a note saying so and how to show them again; nobody else does.
describe('ShopPublicPage — #625 a Page\'s own words, hidden', () => {
  it('tells the owner, and only the owner', () => {
    renderShop({ shop: { ...SHOP, wordsHidden: true }, loggedIn: true, viewerOwnsPage: true })
    expect(screen.getByTestId('page-words-hidden-note')).toHaveTextContent(/Edit either one to show them again/)
    cleanup()
    renderShop({ shop: { ...SHOP, wordsHidden: true, displayName: 'Hidden while we look' }, loggedIn: true, viewerOwnsPage: false })
    expect(screen.queryByTestId('page-words-hidden-note')).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hidden while we look')
  })
})

// #909 — the owner's search-demand card: theirs only, and only on a live Page.
describe('ShopPublicPage — what locals searched (#909)', () => {
  const demand = { fit: [{ query: 'sourdough', searches: 4 }], zero: [] }
  it('the owner sees it', () => {
    renderShop({ loggedIn: true, viewerOwnsPage: true, pagePath: '/g/7k3x8m', searchDemand: demand })
    expect(screen.getByTestId('search-demand-card')).toBeInTheDocument()
  })
  it('a visitor never does, even if a value slipped through', () => {
    renderShop({ loggedIn: true, viewerOwnsPage: false, pagePath: '/g/7k3x8m', searchDemand: demand })
    expect(screen.queryByTestId('search-demand-card')).toBeNull()
  })
  it('not on a draft', () => {
    renderShop({ loggedIn: true, viewerOwnsPage: true, pagePath: '/g/7k3x8m', searchDemand: demand, shop: { ...SHOP, lifecycleState: 'draft' } })
    expect(screen.queryByTestId('search-demand-card')).toBeNull()
  })
})

// #896 — the map shows where the Page is, and opens in Maps.
describe('#896 — the Location map', () => {
  const point = { source: 'anchor' as const, kind: 'point' as const, label: '2700 K St, Sacramento, CA 95816', lng: -121.47103, lat: 38.57271 }
  const area = { source: 'anchor' as const, kind: 'area' as const, label: 'Midtown', lng: -121.48456, lat: 38.57123 }
  const visit = { mode: 'visit' as const, howToFind: null, usuallyAround: null, towns: [] }
  const roaming = { mode: 'roaming' as const, howToFind: null, usuallyAround: 'farmers markets', towns: [] }

  it('the address sits under the map; the map opens our own map on this Page; Directions leave the app', () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'tok')
    renderShop({ shop: { ...SHOP, placements: [point] }, loggedIn: true, where: visit })
    const map = screen.getByRole('img', { name: `Map of ${point.label}` })
    const address = screen.getByTestId('shop-placement')
    expect(address).toHaveTextContent(point.label)
    expect(map.compareDocumentPosition(address) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('link', { name: `Show ${point.label} on the map` })).toHaveAttribute('href', `/explore?view=map&focus=${SHOP.publicId}&at=-121.47103%2C38.57271`)
    expect(screen.queryByText(/open in maps/i)).toBeNull()
    expect(screen.getByRole('link', { name: 'Directions' })).toHaveAttribute('href', expect.stringContaining('google.com/maps/dir/'))
    vi.unstubAllEnvs()
  })

  // Privacy: a Page that shares only an area, or that moves, never puts its
  // exact point or address anywhere in what the visitor's browser receives.
  // Don, 2026-10-18: "area only doesn't need a map to open but does need some kind of indicator about where it's at".
  it('an area-only Page: no map, a plain line saying where, never its point', () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'tok')
    const { container } = renderShop({ shop: { ...SHOP, placements: [area] }, loggedIn: true, where: visit })
    expect(screen.getByTestId('shop-placement')).toHaveTextContent('In Midtown')
    expect(container.querySelector('img[src*="mapbox"]')).toBeNull()
    expect(screen.queryByRole('link', { name: /on the map/ })).toBeNull()
    expect(container.innerHTML).not.toContain('-121.48456')
    expect(container.innerHTML).not.toContain('38.57123')
    expect(screen.queryByRole('link', { name: 'Directions' })).toBeNull()
    vi.unstubAllEnvs()
  })

  it('a Page that moves never sends its address or point, even with a fixed anchor', () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'tok')
    const { container } = renderShop({ shop: { ...SHOP, placements: [point] }, loggedIn: true, where: roaming })
    expect(screen.getByTestId('shop-where')).toHaveTextContent('Around the Sacramento area, usually farmers markets')
    expect(screen.queryByRole('link', { name: /on the map/ })).toBeNull()
    expect(container.innerHTML).not.toContain('2700 K St')
    expect(container.innerHTML).not.toContain('-121.47103')
    expect(container.innerHTML).not.toContain('38.57271')
    expect(screen.queryByRole('link', { name: 'Directions' })).toBeNull()
    vi.unstubAllEnvs()
  })

  it('signed out, no map and no Maps links', () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'tok')
    const { container } = renderShop({ shop: { ...SHOP, placements: [point] }, loggedIn: false, where: visit })
    expect(screen.queryByRole('link', { name: /on the map|Directions/ })).toBeNull()
    expect(container.innerHTML).not.toContain('38.57271')
    vi.unstubAllEnvs()
  })
})

// #896 — Contact holds the website and the social links (Yelp, Google Business Profile).
describe('#896 — Contact holds website, phone and socials', () => {
  const socialLinks = {
    instagram: 'https://instagram.com/claras',
    facebook: 'https://facebook.com/clarasbakery',
    tiktok: 'https://www.tiktok.com/@claras',
    youtube: 'https://youtube.com/@claras',
    website: 'https://clarasbakery.com/',
  }

  it('every link out sits in Contact, TikTok, Instagram, Facebook first, each href as stored', () => {
    renderShop({ shop: { ...SHOP, socialLinks }, loggedIn: true, contact: { phone: '+19165550142', hours: null } })
    const contact = screen.getByTestId('page-section-contact')
    expect(within(contact).getByTestId('page-phone')).toHaveAttribute('href', 'tel:+19165550142')
    const site = within(contact).getByTestId('shop-social-website')
    expect(site).toHaveAttribute('href', 'https://clarasbakery.com/')
    expect(site).toHaveTextContent('clarasbakery.com')
    const socials = within(contact).getAllByTestId(/^shop-social-(?!website|links)/)
    expect(socials.map((a) => a.getAttribute('data-testid'))).toEqual([
      'shop-social-tiktok', 'shop-social-instagram', 'shop-social-facebook', 'shop-social-youtube',
    ])
    for (const a of [site, ...socials]) {
      const href = a.getAttribute('href')!
      expect(Object.values(socialLinks)).toContain(href)
      expect(new URL(href).protocol).toBe('https:')
      expect(a).toHaveAttribute('target', '_blank')
      expect(a).toHaveAttribute('rel', 'noopener noreferrer')
    }
    expect(within(contact).getByRole('link', { name: 'Instagram: @claras' })).toBeInTheDocument()
    expect(within(contact).getByRole('link', { name: 'TikTok: @claras' })).toBeInTheDocument()
  })

  it('tags stay for interests only: no links out beside them', () => {
    renderShop({ shop: { ...SHOP, socialLinks }, loggedIn: true, tags: ['Sourdough'] })
    const tags = screen.getByTestId('page-section-found')
    expect(within(tags).queryAllByRole('link').map((a) => a.getAttribute('href'))).not.toContain(socialLinks.instagram)
    expect(within(tags).getByRole('heading')).toHaveTextContent('Tags')
  })

  it("an unclaimed Page's source site is credited in About and listed in Contact", () => {
    const unclaimed = { publicInfoUrl: 'https://cornerbakery.example/', photoCredit: null, photoSourceUrl: null }
    renderShop({ shop: { ...SHOP, unclaimed } as never, loggedIn: true })
    expect(screen.getByTestId('description-credit')).toHaveAttribute('href', 'https://cornerbakery.example/')
    const site = within(screen.getByTestId('page-section-contact')).getByTestId('shop-social-website')
    expect(site).toHaveAttribute('href', 'https://cornerbakery.example/')
  })

  it('withholds a website that is not https', () => {
    const unclaimed = { publicInfoUrl: 'javascript:alert(1)', photoCredit: null, photoSourceUrl: null }
    renderShop({ shop: { ...SHOP, unclaimed } as never, loggedIn: true })
    expect(screen.queryByTestId('shop-social-website')).toBeNull()
  })

  it('signed out, no Contact at all, even if handed every field', () => {
    const { container } = renderShop({ shop: { ...SHOP, socialLinks }, loggedIn: false, contact: { phone: '+19165550142', hours: null } })
    expect(screen.queryByTestId('page-section-contact')).toBeNull()
    expect(container.innerHTML).not.toContain('5550142')
    for (const url of Object.values(socialLinks)) expect(container.innerHTML).not.toContain(url)
  })
})

// Don, 2026-10-18 [always]: no chip or pill UI — typography, spacing and quiet text links.
describe('#896 — Location, Contact and Tags carry no chips or pills', () => {
  it('nothing rounded-full or button-styled in those sections', () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'tok')
    renderShop({
      shop: { ...SHOP, socialLinks: { instagram: 'https://instagram.com/claras', website: 'https://claras.example/' }, placements: [{ source: 'anchor', kind: 'point', label: '1 Main St', lng: -121.5, lat: 38.5 }] },
      loggedIn: true,
      tags: ['Sourdough'],
      contact: { phone: '+19165550142', hours: null },
    })
    for (const id of ['location', 'contact', 'found']) {
      const section = screen.getByTestId(`page-section-${id}`)
      expect(section.querySelector('[class*="rounded-full"], [class*="btn-"]')).toBeNull()
    }
    vi.unstubAllEnvs()
  })
})

describe('#830 — Report is a ⋯ menu entry on the Page and on each post, for non-owners only', () => {
  const POSTS = [
    { id: 'p1', body: 'Bread', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', startsAt: null, endsAt: null, locationLabel: null },
    { id: 'p2', body: 'Rolls', createdAt: '2026-10-02T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z', startsAt: null, endsAt: null, locationLabel: null },
  ]
  const labels = () => screen.queryAllByRole('menuitem').map((i) => i.textContent)

  it('a signed-in non-owner finds "Report this Page" in the Page header menu and "Report this post" on each post', () => {
    renderShop({ loggedIn: true, viewerOwnsPage: false, posts: POSTS })
    const menus = screen.getAllByRole('button', { name: 'More options' })
    expect(menus).toHaveLength(1 + POSTS.length)
    fireEvent.click(menus[0])
    expect(labels()).toContain('Report this Page')
    fireEvent.click(menus[0])
    for (const m of menus.slice(1)) {
      fireEvent.click(m)
      expect(labels()).toEqual(['Report this post'])
      fireEvent.click(m)
    }
  })

  it('an owner sees no Report anywhere on their own Page', () => {
    renderShop({ loggedIn: true, viewerOwnsPage: true, posts: POSTS })
    expect(screen.queryByRole('button', { name: 'More options' })).toBeNull()
    expect(screen.queryByText(/^Report this/)).toBeNull()
  })

  it('the Page menu names the photo as its own item', () => {
    renderShop({ loggedIn: true, viewerOwnsPage: false })
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    expect(labels()).toEqual(['Report this Page', "Report this Page's photo"])
  })
})

// #896 — every answer to "where is it?" on the Page.
describe('#896 — the Location card for each answer', () => {
  const anchor = { source: 'anchor' as const, kind: 'area' as const, label: 'East Sacramento', lng: -121.46123, lat: 38.56456 }
  const base = { howToFind: null, usuallyAround: null, towns: [] }
  const html = (c: HTMLElement) => c.innerHTML

  it('cross streets or a landmark: a pin, the words under it, Directions by the pin', () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'tok')
    const landmark = { source: 'anchor' as const, kind: 'point' as const, label: 'J St & 20th St, by the fountain', lng: -121.47103, lat: 38.57271 }
    renderShop({ shop: { ...SHOP, placements: [landmark] }, loggedIn: true, where: { ...base, mode: 'landmark' } })
    expect(screen.getByRole('img', { name: 'Map of J St & 20th St, by the fountain' })).toBeInTheDocument()
    expect(screen.getByTestId('shop-placement')).toHaveTextContent('J St & 20th St, by the fountain')
    expect(screen.getByRole('link', { name: 'Directions' })).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=38.57271,-121.47103')
    vi.unstubAllEnvs()
  })

  it('more than one location: each listed with its own Directions, by name and address, no single map', () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'tok')
    const stops = [{ label: '2700 K St, Sacramento', whenText: null }, { label: '915 I St, Sacramento', whenText: null }]
    const { container } = renderShop({ shop: { ...SHOP, placements: [anchor] }, loggedIn: true, where: { ...base, mode: 'multi', stops } })
    const items = within(screen.getByTestId('page-stops')).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('2700 K St, Sacramento')
    expect(within(items[0]!).getByRole('link', { name: 'Directions to 2700 K St, Sacramento' })).toHaveAttribute('href', expect.stringContaining('destination=Oak%20Park%20Sourdough%2C%202700%20K%20St%2C%20Sacramento'))
    expect(within(items[1]!).getByRole('link', { name: 'Directions to 915 I St, Sacramento' })).toHaveAttribute('href', expect.stringContaining('destination=Oak%20Park%20Sourdough%2C%20915%20I%20St'))
    expect(screen.queryByText(/open in maps/i)).toBeNull()
    expect(container.querySelector('img[src*="mapbox"]')).toBeNull()
    expect(html(container)).not.toContain('East Sacramento')
    vi.unstubAllEnvs()
  })

  it('it moves: where it usually is, then where and when, each with Directions', () => {
    const stops = [{ label: 'Midtown Farmers Market', whenText: 'Saturdays, 8am–1pm' }]
    renderShop({ shop: { ...SHOP, placements: [anchor] }, loggedIn: true, where: { ...base, mode: 'roaming', usuallyAround: 'Midtown', stops } })
    expect(screen.getByTestId('shop-where')).toHaveTextContent('Around the Sacramento area, usually Midtown')
    const [item] = within(screen.getByTestId('page-stops')).getAllByRole('listitem')
    expect(item).toHaveTextContent('Saturdays, 8am–1pm')
    expect(item).toHaveTextContent('Midtown Farmers Market')
    expect(within(item!).getByRole('link', { name: 'Directions to Midtown Farmers Market' })).toHaveAttribute('href', expect.stringContaining('destination=Midtown%20Farmers%20Market'))
  })

  // Visibility: (a) I go to them, (b) neighbourhood only and (f) online never send an exact point.
  it('online: its line, no map, no Maps link, no point', () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'tok')
    const { container } = renderShop({ shop: { ...SHOP, placements: [anchor] }, loggedIn: true, where: { ...base, mode: 'online' } })
    expect(screen.getByTestId('shop-where')).toHaveTextContent('Online, or by appointment')
    expect(container.querySelector('img[src*="mapbox"]')).toBeNull()
    expect(screen.queryByRole('link', { name: /on the map|Directions/ })).toBeNull()
    expect(html(container)).not.toContain('-121.46123')
    expect(html(container)).not.toContain('38.56456')
    vi.unstubAllEnvs()
  })

  it('I go to them: a line naming where it serves, no map, never its anchor point', () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'tok')
    const { container } = renderShop({ shop: { ...SHOP, placements: [anchor] }, loggedIn: true, where: { ...base, mode: 'travel', towns: [{ id: 't1', name: 'Midtown' }, { id: 't2', name: 'East Sacramento' }].slice(0, 1) } })
    expect(screen.getByTestId('shop-where')).toHaveTextContent('Comes to you in Midtown')
    expect(container.querySelector('img[src*="mapbox"]')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Directions' })).toBeNull()
    expect(html(container)).not.toContain('-121.46123')
    expect(html(container)).not.toContain('East Sacramento')
    vi.unstubAllEnvs()
  })

  it('signed out, none of it — not the stops either', () => {
    const stops = [{ label: 'Midtown Farmers Market', whenText: 'Saturdays' }]
    const { container } = renderShop({ shop: { ...SHOP, placements: [anchor] }, loggedIn: false, where: { ...base, mode: 'roaming', stops } })
    expect(html(container)).not.toContain('Midtown Farmers Market')
  })
})

// #936 — Directions find the business by name at its street address, not its town.
describe('#936 — Maps finds the business by name and address', () => {
  it('Directions carry the Page name and its full street address', () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'tok')
    const point = { source: 'anchor' as const, kind: 'point' as const, label: '15010 Ridge Road, Sutter Creek, CA', lng: -120.8401, lat: 38.3655 }
    renderShop({ shop: { ...SHOP, displayName: 'Vino Tahoe', placements: [point] }, loggedIn: true })
    expect(screen.getByRole('link', { name: 'Directions' })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=Vino%20Tahoe%2C%2015010%20Ridge%20Road%2C%20Sutter%20Creek%2C%20CA',
    )
    expect(screen.getByRole('img', { name: 'Map of 15010 Ridge Road, Sutter Creek, CA' }).getAttribute('src')).toContain('pin-l+24405a(-120.8401,38.3655)')
    vi.unstubAllEnvs()
  })

  it('an area-only Page never gets a name-and-address search or directions', () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'tok')
    const area = { source: 'anchor' as const, kind: 'area' as const, label: 'Sutter Creek', lng: -120.80241, lat: 38.39301 }
    const { container } = renderShop({ shop: { ...SHOP, displayName: 'Vino Tahoe', placements: [area] }, loggedIn: true })
    expect(screen.queryByRole('link', { name: 'Directions' })).toBeNull()
    expect(container.innerHTML).not.toContain('Vino%20Tahoe')
    expect(container.innerHTML).not.toContain('-120.80241')
    vi.unstubAllEnvs()
  })
})
