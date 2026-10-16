// The owner's surface for their own Page — a child of the Page it edits.
//
// Issue #175. This was `/manage/<slug>`, a parallel top-level route, for one
// reason: the old address lived under a catch-all and Next.js refuses a static
// segment after one. The canonical address is a single dynamic segment, so the
// edit surface sits where it belongs, at `/g/<slug>-<id>/edit`.
//
// #412 — the PM, 2026-10-06: section cards, each with one Edit that opens that
// section's sheet (EditCards).
//
// A non-owner gets 404, not 403: the surface does not announce itself. The
// check is server-side and the cards are not rendered at all for anyone else —
// and the write behind it re-checks the managing role, so this is a courtesy
// rather than the boundary.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { viewerId } from '@/lib/auth/viewer'
import { viewerOwnsPage } from '@/lib/groups/resolve-shop'
import { resolvePageById } from '@/lib/groups/resolve-page-address'
import { canonicalPagePath } from '@/lib/groups/page-handle'
import { EditCards } from '@/components/group/edit/EditCards'
import { resolvePageWhere } from '@/lib/groups/page-where'
import { savedPinFrom, whereValueFrom } from '@/components/locations/where-save'
import { componentOn } from '@/lib/groups/page-components'
import { resolvePageContact } from '@/lib/groups/page-contact'
import { editPageAction } from './actions'
import { archivePageAction, deletePageAction, restorePageAction } from '@/app/_actions/page-lifecycle-actions'
import { DRAFT_NAME_PLACEHOLDER } from '@/actions/group/constants'
import { pageKindOf, purposeOf } from '@/lib/groups/page-kind'

export const dynamic = 'force-dynamic'

export default async function EditPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const supabase = await createClient()
  // #555 — this was six reads in a row, each a trip to the database, before the owner saw anything. The viewer and the Page
  // are independent; then ownership and everything the cards show are read together. A non-owner still gets a 404 and
  // nothing renders: the extra reads are row-level-secured and their result is thrown away on that path.
  // #791 — the viewer from the session's verified claims, with no round trip to the auth server.
  const [memberId, shop] = await Promise.all([viewerId(supabase), resolvePageById(supabase, handle)])
  if (!memberId) notFound()
  if (!shop) notFound()

  const [owns, contactRow, { data: meta }, { data: tagRows }, saved] = await Promise.all([
    viewerOwnsPage(supabase, {
      groupId: shop.groupId,
      viewerMemberId: memberId,
      kind: shop.kind,
    }),
    resolvePageContact(supabase, shop.groupId),
    supabase.from('groups').select('metadata').eq('id', shop.groupId).maybeSingle(),
    // #285 — the Page's tags, as the owner reads them. A tag taken down is not offered back; saving leaves it off.
    supabase.from('page_tags').select('tags(label)').eq('group_id', shop.groupId),
    // #348 — start the question from what's saved; #455 — the map opens on the saved pin.
    resolvePageWhere(supabase, shop.groupId),
  ])
  if (!owns) notFound()

  const pagePath = canonicalPagePath(shop.publicId)
  const isDraft = shop.lifecycleState === 'draft'
  const contact = contactRow ?? { phone: null, hours: null }
  // Don, 2026-10-04 — hours and phone: on for shops and services, off for a
  // group until its owner adds them.
  const metadata = (meta as { metadata?: unknown } | null)?.metadata
  const contactOn = componentOn(shop.kind, metadata, 'contact')
  const productsOn = componentOn(shop.kind, metadata, 'products')

  const initialTags = ((tagRows ?? []) as unknown as { tags: { label: string } | null }[])
    .map((r) => r.tags?.label)
    .filter((l): l is string => Boolean(l))

  const initialWhere = whereValueFrom(saved, shop.placements[0])

  return (
    <main className="mx-auto w-full max-w-form gutter py-6 pb-nav">
      <EditCards
        title={isDraft && shop.displayName === DRAFT_NAME_PLACEHOLDER ? 'Edit your new Page' : `Edit ${shop.displayName}`}
        isDraft={isDraft}
        onSave={editPageAction}
        // #423 — archive and delete; the handlers re-check the managing role.
        settings={{
          lifecycleState: shop.lifecycleState === 'archived' ? 'archived' : 'active',
          onArchive: archivePageAction,
          onRestore: restorePageAction,
          onDelete: deletePageAction,
        }}
        initial={{
          groupId: shop.groupId,
          pagePath,
          memberId,
          name: isDraft && shop.displayName === DRAFT_NAME_PLACEHOLDER ? '' : shop.displayName,
          description: shop.publicDescription,
          photoUrl: shop.photoUrl,
          pictureUrl: shop.pictureUrl,
          socialLinks: shop.socialLinks,
          tags: initialTags,
          contact,
          contactOn,
          // Issue #180 — where the Page is, in the words it was saved with.
          addressLabel: shop.placements[0]?.label || null,
          kind: pageKindOf(shop.kind),
          purpose: purposeOf(shop.kind, shop.purpose),
          productsOn,
          where: initialWhere,
          savedPin: savedPinFrom(shop.placements[0]),
        }}
      />
    </main>
  )
}
