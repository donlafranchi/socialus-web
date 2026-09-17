// T074 — Unit tests for <ShopPublicPage> (F035 read surface).
// Trace: planning/now/scenario-F035-rosa-finds-mayas-shop.md story beats 1–6.

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ShopPublicPage } from './ShopPublicPage'
import type { ResolvedShop } from '@/lib/groups/resolve-shop'

afterEach(cleanup)

const SHOP: ResolvedShop = {
  groupId: 'grp-1',
  slug: 'oak-park-sourdough',
  displayName: 'Oak Park Sourdough',
  publicDescription: 'Real bread, baked local.',
  lifecycleState: 'active',
  anchorLocationId: 'loc-1',
  category: null,
  photoUrl: null,
  socialLinks: {},
  photoHiddenAt: null,
  discoverability: 'listed',
  placements: [],
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

  it('links the founder to their Member page when hasPublished=true; avatar is decorative', () => {
    renderShop()
    const founder = screen.getByTestId('shop-founder')
    const link = screen.getByTestId('shop-founder-link')
    expect(link).toHaveAttribute('href', '/m/maya')
    expect(founder).toHaveTextContent('Maya Rivera')
    // a11y: avatar is decorative (alt="") so the link name isn't duplicated.
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
    renderShop({ items: [] })
    const empty = screen.getByTestId('shop-items-empty')
    expect(empty).toBeInTheDocument()
    expect(empty).toHaveTextContent(/check back soon/i)
  })

  it('lists items when present', () => {
    renderShop({ items: [{ id: 'i1', title: 'Country Loaf', kind: 'product' }] })
    expect(screen.queryByTestId('shop-items-empty')).not.toBeInTheDocument()
    expect(screen.getByText('Country Loaf')).toBeInTheDocument()
  })
})

describe('ShopPublicPage — Beat 6 (draft owner preview)', () => {
  it('shows the draft banner + resume link for a draft row', () => {
    renderShop({ shop: { ...SHOP, lifecycleState: 'draft' } })
    const banner = screen.getByTestId('shop-draft-banner')
    expect(banner).toHaveTextContent(/not yet public/i)
    expect(banner.querySelector('a')).toHaveAttribute('href', '/you/sell')
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
  it('every viewer gets the ⋯ control, signed in or not', () => {
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
    renderShop({ shop: { ...SHOP, socialLinks: { instagram: 'https://instagram.com/claras' } } })
    const a = screen.getByTestId('shop-social-instagram')
    expect(a).toHaveAttribute('href', 'https://instagram.com/claras')
    expect(a).toHaveAttribute('rel', 'noopener noreferrer')
  })

  // The one that matters. A row that predates the CHECK, or anything that
  // bypassed the action layer, must not reach an href.
  it('withholds a link that is not https, rather than rendering it', () => {
    renderShop({ shop: { ...SHOP, socialLinks: { instagram: 'javascript:alert(1)' } as never } })
    expect(screen.queryByTestId('shop-social-instagram')).toBeNull()
    expect(screen.queryByTestId('shop-social-links')).toBeNull()
  })
})
