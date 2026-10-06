// T060 — Place-scoped URL catch-all.
//
// Spec: product/systems/places.md § URL-prefix derivation;
//       ADR-20 § URL hierarchy;
//       ADR-0022 § Trade-offs (county tier is URL-skippable; state slug = USPS code).
//
// This catch-all handles bare place URLs at b1.x:
//   /p/ca                                  — California (state)
//   /p/ca/sacramento                       — Sacramento (city; county skipped)
//   /p/ca/sacramento/oak-park              — Oak Park (neighborhood)
//   /p/ca/yolo                             — Yolo County (no city → falls
//                                            through to county tier)
//   /p/ca/west-sacramento                  — West Sacramento (city under
//                                            Yolo County; county skipped)
//
// b1.1+ structural constraint (flagged in DEVIATIONS § T060): Next.js
// App Router does NOT allow a static segment after a catch-all
// (`app/p/[...slug]/g/[id]/page.tsx` is rejected). When Groups, Locations,
// and Items need to nest under `/p/<place>/g/<group>`, the dispatch will
// have to fold into THIS file — inspect the segments for `/g/`, `/l/`, or
// inner `/p/` markers and render the appropriate view. ADR-20 did not
// anticipate the Next.js limit; revisit before the b1.1 Group surface work.

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { resolvePlacePath } from '@/lib/places/resolve-path'
import { PlaceBreadcrumb } from '@/components/place-breadcrumb'
import { splitGroupSlug } from '@/lib/groups/resolve-shop'
import { splitItemSlug, resolveProduct } from '@/lib/items/resolve-product'
import { ProductPublicPage } from '@/components/item/ProductPublicPage'
import { splitServiceSlug, resolveService } from '@/lib/items/resolve-service'
import { ServicePublicPage } from '@/components/item/ServicePublicPage'
import {
  splitGatheringSlug,
  resolveGathering,
  gatheringWhenLabel,
} from '@/lib/items/resolve-gathering'
import { GatheringPublicPage } from '@/components/item/GatheringPublicPage'
import {
  splitLocationSlug,
  resolveVenue,
  venueDistanceMeters,
  existingVenueSavedSearchId,
} from '@/lib/locations/resolve-venue'
import {
  resolveOwningGroup,
  getVenueHostedItems,
  getVenueNearbyItems,
} from '@/lib/locations/resolve-venue-items'
import { VenuePublicPage } from '@/components/venue/VenuePublicPage'

/** Human-readable next-occurrence date for a gathering (real clock). */
interface Props {
  params: Promise<{ slug: string[] }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()

  // Product Item page — /p/[…place]/g/[group]/p/[item]. Checked before the
  // Group split (which would otherwise match the group segment and ignore the
  // trailing /p/<item>). Per T060 DEVIATION, all nested dispatch folds here.
  const itemSplit = splitItemSlug(slug)
  if (itemSplit) {
    const product = await resolveProduct(supabase, {
      groupSlug: itemSplit.groupSlug,
      itemSlug: itemSplit.itemSlug,
    })
    if (!product) {
      return { title: 'Not found — SocialUs' }
    }
    return {
      title: `${product.title} — SocialUs`,
      description:
        product.description ||
        `${product.title}${product.brandLabel ? ` from ${product.brandLabel}` : ''}.`,
    }
  }

  // Service Item page — /p/[…place]/g/[group]/s/[item]. Like the product
  // dispatch, checked before the Group split (the `/s/` marker distinguishes
  // it from product `/p/` and the bare Shop page).
  const serviceSplit = splitServiceSlug(slug)
  if (serviceSplit) {
    const service = await resolveService(supabase, {
      groupSlug: serviceSplit.groupSlug,
      itemSlug: serviceSplit.itemSlug,
    })
    if (!service) {
      return { title: 'Not found — SocialUs' }
    }
    return {
      title: `${service.title} — SocialUs`,
      description:
        service.description ||
        `${service.title}${service.brandLabel ? ` from ${service.brandLabel}` : ''}.`,
    }
  }

  // Gathering Item page — /p/[…place]/g/[group]/e/[item]. Like the product
  // dispatch, checked before the Group split (the `/e/` marker distinguishes it
  // from the product `/p/` and the bare Shop page).
  const gatheringSplit = splitGatheringSlug(slug)
  if (gatheringSplit) {
    const gathering = await resolveGathering(supabase, {
      groupSlug: gatheringSplit.groupSlug,
      itemSlug: gatheringSplit.itemSlug,
    })
    if (!gathering) {
      return { title: 'Not found — SocialUs' }
    }
    return {
      title: `${gathering.title} — SocialUs`,
      description:
        gathering.description ||
        `${gathering.title}${gathering.brandLabel ? ` at ${gathering.brandLabel}` : ''}.`,
    }
  }

  // Venue (Location) page — /p/[…place]/l/[slug]. Like the Group dispatch, folds
  // into this catch-all (T060 DEVIATION). The `/l/` marker distinguishes it from
  // the `/g/` Group split and the bare place path.
  const locationSplit = splitLocationSlug(slug)
  if (locationSplit) {
    const venue = await resolveVenue(supabase, locationSplit.locationSlug)
    if (!venue) {
      return { title: 'Not found — SocialUs' }
    }
    return {
      title: `${venue.label} — SocialUs`,
      description:
        venue.description || `${venue.label} — a venue on SocialUs.`,
    }
  }

  // #411 — /p/[…place]/g/[slug] is no Page address; not forwarded while there
  // are no members to protect.
  if (splitGroupSlug(slug)) return { title: 'Not found — SocialUs' }

  const resolved = await resolvePlacePath(supabase, slug)
  if (!resolved) {
    return { title: 'Place not found — SocialUs' }
  }
  const rootDisplay = resolved.ancestors[0]?.display_name ?? resolved.place.display_name
  return {
    title:
      resolved.ancestors.length === 0
        ? `${resolved.place.display_name} — SocialUs`
        : `${resolved.place.display_name} — ${rootDisplay}`,
    description: `Browse what's happening in ${resolved.place.display_name}.`,
  }
}

export default async function PlacePage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()

  // Product Item page dispatch — /p/[…place]/g/[group]/p/[item]. Checked before
  // the Group split. RLS (items_select_published) is the visibility gate.
  const itemSplit = splitItemSlug(slug)
  if (itemSplit) {
    const product = await resolveProduct(supabase, {
      groupSlug: itemSplit.groupSlug,
      itemSlug: itemSplit.itemSlug,
    })
    if (!product) {
      notFound()
    }
    const groupHref = `/p/${itemSplit.placeSegments.join('/')}/g/${itemSplit.groupSlug}`
    return <ProductPublicPage product={product} groupHref={groupHref} />
  }

  // Service Item page dispatch — /p/[…place]/g/[group]/s/[item]. Checked before
  // the Group split. RLS (items_select_published) is the visibility gate.
  const serviceSplit = splitServiceSlug(slug)
  if (serviceSplit) {
    const service = await resolveService(supabase, {
      groupSlug: serviceSplit.groupSlug,
      itemSlug: serviceSplit.itemSlug,
    })
    if (!service) {
      notFound()
    }
    const groupHref = `/p/${serviceSplit.placeSegments.join('/')}/g/${serviceSplit.groupSlug}`
    return <ServicePublicPage service={service} groupHref={groupHref} />
  }

  // Gathering Item page dispatch — /p/[…place]/g/[group]/e/[item]. Checked
  // before the Group split. RLS (items_select_published) is the visibility gate.
  const gatheringSplit = splitGatheringSlug(slug)
  if (gatheringSplit) {
    const gathering = await resolveGathering(supabase, {
      groupSlug: gatheringSplit.groupSlug,
      itemSlug: gatheringSplit.itemSlug,
    })
    if (!gathering) {
      notFound()
    }
    const placePath = gatheringSplit.placeSegments.join('/')
    const groupHref = `/p/${placePath}/g/${gatheringSplit.groupSlug}`
    const shareUrl = `${groupHref}/e/${gatheringSplit.itemSlug}`
    return (
      <GatheringPublicPage
        gathering={gathering}
        groupHref={groupHref}
        nextOccurrenceLabel={gatheringWhenLabel(gathering.startsAt, gathering.endsAt, gathering.recurrenceRule)}
        shareUrl={shareUrl}
      />
    )
  }

  // Venue (Location) page dispatch — /p/[…place]/l/[slug]. RLS
  // (locations_public_read) is the visibility gate: a private or soft-deleted
  // Location yields no row → 404 to non-owners.
  const locationSplit = splitLocationSlug(slug)
  if (locationSplit) {
    const venue = await resolveVenue(supabase, locationSplit.locationSlug)
    if (!venue) {
      notFound()
    }
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const loggedIn = Boolean(user)
    // Anon viewers have no member_place_interests row and never follow, so both
    // reads are owner-only — skip them entirely when logged out.
    const [distanceMeters, existingSavedSearchId] = loggedIn
      ? await Promise.all([
          venueDistanceMeters(supabase, venue.locationId),
          existingVenueSavedSearchId(supabase, venue.locationId),
        ])
      : [null, null]
    const venuePath = `/p/${slug.join('/')}`
    const hostHref = loggedIn
      ? // #336 — hosting is a dated Post from a Page; Create starts one.
        '/create'
      : `/auth/login?next=${encodeURIComponent(`${venuePath}?action=host`)}`
    // Content sections (T105) — public, so they run for anon too. Owning Group
    // scopes "What's happening here"; nearby excludes it.
    const owningGroupId = await resolveOwningGroup(supabase, venue.locationId)
    const [hostedItems, nearbyItems] = await Promise.all([
      getVenueHostedItems(supabase, { locationId: venue.locationId, owningGroupId }),
      getVenueNearbyItems(supabase, { locationId: venue.locationId, owningGroupId }),
    ])
    return (
      <VenuePublicPage
        venue={venue}
        loggedIn={loggedIn}
        existingSavedSearchId={existingSavedSearchId}
        distanceMeters={distanceMeters}
        hostHref={hostHref}
        owningGroupId={owningGroupId}
        hostedItems={hostedItems}
        nearbyItems={nearbyItems}
      />
    )
  }

  // #411 — /p/[…place]/g/[slug] is no Page address; not forwarded while there
  // are no members to protect.
  if (splitGroupSlug(slug)) notFound()

  const resolved = await resolvePlacePath(supabase, slug)

  if (!resolved) {
    notFound()
  }

  const { place, ancestors } = resolved

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <PlaceBreadcrumb place={place} ancestors={ancestors} />
      <h1 className="mt-4 text-2xl font-semibold" data-testid="place-display-name">
        {place.display_name}
      </h1>
      <p className="mt-2 text-sm text-gray-600" data-testid="place-kind">
        {place.kind}
      </p>

      {/* b2 surface — curated place landing (locations / groups / recent items
          in this scope). Placeholder at b1.x per places.md § T2. */}
      <section className="mt-8 rounded border border-dashed border-gray-300 p-6 text-sm text-gray-500">
        <p>
          The curated landing for this place ships at b2 (places.md § T2).
          For now, you&apos;ve confirmed the URL resolves and the place tree
          is wired.
        </p>
      </section>
    </main>
  )
}
