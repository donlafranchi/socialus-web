// The owner's surface for their own Page — a child of the Page it edits.
//
// Issue #175. This was `/manage/<slug>`, a parallel top-level route, for one
// reason: the old address lived under a catch-all and Next.js refuses a static
// segment after one. The canonical address is a single dynamic segment, so the
// edit surface sits where it belongs, at `/g/<slug>-<id>/edit`.
//
// A non-owner gets 404, not 403: the surface does not announce itself. The
// check is server-side and the form is not rendered at all for anyone else —
// and the write behind it re-checks the managing role, so this is a courtesy
// rather than the boundary.

import { notFound, permanentRedirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { viewerOwnsPage } from '@/lib/groups/resolve-shop'
import { resolvePageByHandle } from '@/lib/groups/resolve-page-address'
import { canonicalPagePath } from '@/lib/groups/page-handle'
import { EditPageForm } from './EditPageForm'
import { componentOn } from '@/lib/groups/page-components'
import { resolvePageContact } from '@/lib/groups/page-contact'
import { editPageAction } from './actions'
import { DRAFT_NAME_PLACEHOLDER } from '@/actions/group/constants'

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
  const contactOn = componentOn(shop.kind, (meta as { metadata?: unknown } | null)?.metadata, 'contact')

  // #285 — the Page's tags, as the owner reads them. A tag taken down is not
  // offered back; saving leaves it off.
  const { data: tagRows } = await supabase
    .from('page_tags')
    .select('tags(label)')
    .eq('group_id', shop.groupId)
  const initialTags = ((tagRows ?? []) as unknown as { tags: { label: string } | null }[])
    .map((r) => r.tags?.label)
    .filter((l): l is string => Boolean(l))

  return (
    <main className="mx-auto w-full max-w-xl px-3 py-4">
      <h1 className="text-lg font-semibold text-[var(--color-fg)]">
        {isDraft && shop.displayName === DRAFT_NAME_PLACEHOLDER ? 'Edit your new Page' : `Edit ${shop.displayName}`}
      </h1>
      <p className="mt-1 mb-4 text-sm text-[var(--color-fg-muted)]">Only you can see this.</p>
      <EditPageForm
        groupId={shop.groupId}
        memberId={auth.user.id}
        pagePath={pagePath}
        slug={shop.slug}
        initialName={shop.displayName}
        initialDescription={shop.publicDescription}
        initialPhotoUrl={shop.photoUrl}
        initialSocialLinks={shop.socialLinks}
        // Issue #180 — where the Page is, in the words it was saved with.
        // `placements` is T143's read-time resolution of exactly that; the
        // anchor's own label is the first (and today only) entry.
        initialAddressLabel={shop.placements[0]?.label ?? null}
        initialContact={contact}
        contactOn={contactOn}
        initialTags={initialTags}
        isDraft={isDraft}
        onSave={editPageAction}
      />
    </main>
  )
}
