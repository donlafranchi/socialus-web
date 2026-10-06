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

import { notFound, permanentRedirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { viewerOwnsPage } from '@/lib/groups/resolve-shop'
import { resolvePageByHandle } from '@/lib/groups/resolve-page-address'
import { canonicalPagePath } from '@/lib/groups/page-handle'
import { EditCards } from '@/components/group/edit/EditCards'
import { resolvePageWhere } from '@/lib/groups/page-where'
import { whereValueFrom } from '@/components/locations/where-save'
import { componentOn } from '@/lib/groups/page-components'
import { resolvePageContact } from '@/lib/groups/page-contact'
import { editPageAction } from './actions'
import { DRAFT_NAME_PLACEHOLDER } from '@/actions/group/constants'
import { pageKindOf, purposeOf } from '@/lib/groups/page-kind'

export const dynamic = 'force-dynamic'

export default async function EditPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) notFound()

  const found = await resolvePageByHandle(supabase, handle)
  if (!found) notFound()
  // One address for the edit surface too, for the same reason the Page has
  // one: a stale slug resolves and then corrects itself.
  if (found.redirectTo) permanentRedirect(`${found.redirectTo}/edit`)

  const { shop } = found
  const owns = await viewerOwnsPage(supabase, {
    groupId: shop.groupId,
    viewerMemberId: auth.user.id,
    kind: shop.kind,
  })
  if (!owns) notFound()

  const pagePath = canonicalPagePath(shop.slug, shop.publicId)
  const isDraft = shop.lifecycleState === 'draft'
  const contact = (await resolvePageContact(supabase, shop.groupId)) ?? { phone: null, hours: null }
  // Don, 2026-10-04 — hours and phone: on for shops and services, off for a
  // group until its owner adds them.
  const { data: meta } = await supabase.from('groups').select('metadata').eq('id', shop.groupId).maybeSingle()
  const metadata = (meta as { metadata?: unknown } | null)?.metadata
  const contactOn = componentOn(shop.kind, metadata, 'contact')
  const productsOn = componentOn(shop.kind, metadata, 'products')

  // #285 — the Page's tags, as the owner reads them. A tag taken down is not
  // offered back; saving leaves it off.
  const { data: tagRows } = await supabase
    .from('page_tags')
    .select('tags(label)')
    .eq('group_id', shop.groupId)
  const initialTags = ((tagRows ?? []) as unknown as { tags: { label: string } | null }[])
    .map((r) => r.tags?.label)
    .filter((l): l is string => Boolean(l))

  // #348 — start the question from what's saved. A pin isn't carried over:
  // changing a location means setting it again.
  const saved = await resolvePageWhere(supabase, shop.groupId)
  const initialWhere = whereValueFrom(saved)

  return (
    <main className="mx-auto w-full max-w-xl px-3 py-4">
      <h1 className="text-lg font-semibold text-[var(--color-fg)]">
        {isDraft && shop.displayName === DRAFT_NAME_PLACEHOLDER ? 'Edit your new Page' : `Edit ${shop.displayName}`}
      </h1>
      <p className="mt-1 mb-4 text-sm text-[var(--color-fg-muted)]">Only you can see this.</p>
      <EditCards
        slug={shop.slug}
        isDraft={isDraft}
        onSave={editPageAction}
        initial={{
          groupId: shop.groupId,
          pagePath,
          memberId: auth.user.id,
          name: isDraft && shop.displayName === DRAFT_NAME_PLACEHOLDER ? '' : shop.displayName,
          description: shop.publicDescription,
          photoUrl: shop.photoUrl,
          socialLinks: shop.socialLinks,
          tags: initialTags,
          contact,
          contactOn,
          // Issue #180 — where the Page is, in the words it was saved with.
          addressLabel: shop.placements[0]?.label ?? null,
          kind: pageKindOf(shop.kind),
          purpose: purposeOf(shop.kind, shop.purpose),
          productsOn,
          where: initialWhere,
        }}
      />
    </main>
  )
}
