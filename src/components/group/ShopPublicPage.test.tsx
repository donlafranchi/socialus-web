// T074 — Unit tests for <ShopPublicPage> + <FollowShopButton> (F035 read surface).
// Trace: planning/now/scenario-F035-rosa-finds-mayas-shop.md story beats 1–6.

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ShopPublicPage } from './ShopPublicPage'
import { FollowShopButton } from './FollowShopButton'
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

describe('FollowShopButton — Beats 4 & 5', () => {
  it('Beat 5: anonymous viewer gets a "Sign up to follow" link to signup', () => {
    render(<FollowShopButton loggedIn={false} shopName="Oak Park Sourdough" />)
    const cta = screen.getByTestId('follow-shop-signup')
    expect(cta).toHaveTextContent('Sign up to follow')
    expect(cta).toHaveAttribute('href', '/auth/login')
    expect(screen.queryByTestId('follow-shop')).not.toBeInTheDocument()
  })

  it('Beat 4: logged-in viewer gets a "Follow {name}" button', () => {
    render(<FollowShopButton loggedIn shopName="Oak Park Sourdough" />)
    const btn = screen.getByTestId('follow-shop')
    expect(btn.tagName).toBe('BUTTON')
    expect(btn).toHaveTextContent('Follow Oak Park Sourdough')
    expect(screen.queryByTestId('follow-shop-signup')).not.toBeInTheDocument()
  })

  it('Beat 4: persistence is deferred (F042) — tap surfaces a non-destructive status, no crash', () => {
    render(<FollowShopButton loggedIn shopName="Oak Park Sourdough" />)
    fireEvent.click(screen.getByTestId('follow-shop'))
    expect(screen.getByRole('status')).toHaveTextContent(/coming soon/i)
  })
})
