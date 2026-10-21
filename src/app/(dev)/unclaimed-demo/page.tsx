// #353 — an unclaimed Page as a visitor sees it, with invented details, for
// review on a preview before any real listing exists. Claim and Remove write
// nothing here. Not served in production (see ../layout.tsx).

import { ShopPublicPage } from '@/components/group/ShopPublicPage'
import type { ResolvedShop } from '@/lib/groups/resolve-shop'
import { demoChoices, demoProofChoices, demoProof, demoRemove, demoStart, demoVerify } from './actions'

const SHOP: ResolvedShop = {
  groupId: '00000000-0000-4000-8000-000000000353',
  kind: 'business',
  purpose: 'sell',
  slug: 'example-corner-bakery',
  publicId: 'demo353',
  displayName: 'Example Corner Bakery',
  publicDescription:
    'A neighborhood bakery known for sourdough and morning buns, open early on weekdays. Claim this Page to tell your own story.',
  lifecycleState: 'active',
  wordsHidden: false,
  anchorLocationId: null,
  category: null,
  photoUrl: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1200',
  socialLinks: {},
  photoHiddenAt: null,
  photoRemovedAt: null,
  discoverability: 'listed',
  placements: [],
  founder: null,
  unclaimed: {
    publicInfoUrl: 'https://example.com',
    photoCredit: 'Example Corner Bakery (from their website)',
    photoSourceUrl: 'https://example.com',
  },
}

// ?as=member shows the claim as a signed-in member would; ?proof=1 the no-domain, no-phone case.
export default async function UnclaimedDemoPage({ searchParams }: { searchParams: Promise<{ as?: string; proof?: string }> }) {
  const q = await searchParams
  return (
    <ShopPublicPage
      shop={SHOP}
      badge={null}
      items={[]}
      loggedIn={q.as === 'member'}
      pagePath="/unclaimed-demo"
      unclaimedActions={{ claim: { choices: q.proof ? demoProofChoices : demoChoices, start: demoStart, verify: demoVerify, proof: demoProof }, remove: demoRemove }}
    />
  )
}
