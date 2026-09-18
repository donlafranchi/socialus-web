// The owner's surface for their own Page.
//
// It is `/manage/<slug>` rather than `/p/<slug>/edit` because Next.js refuses a
// segment after a catch-all — `/p/[...slug]/edit` fails the build outright. A
// sibling top-level route keeps one resolver and one ownership check, and needs
// no URL gymnastics.
//
// A non-owner gets 404, not 403: the surface does not announce itself, and the
// same pattern the operator review uses. The check is server-side and the form
// is not rendered at all for anyone else — and the write behind it re-checks
// the managing role, so this is a courtesy rather than the boundary.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { resolveShop, viewerOwnsPage } from '@/lib/groups/resolve-shop'
import { EditPageForm } from './EditPageForm'
import { editPageAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function EditPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) notFound()

  const shop = await resolveShop(supabase, slug[slug.length - 1])
  if (!shop) notFound()

  const owns = await viewerOwnsPage(supabase, {
    groupId: shop.groupId,
    viewerMemberId: auth.user.id,
    kind: shop.kind,
  })
  if (!owns) notFound()

  const pagePath = `/p/${slug.join('/')}`

  return (
    <main className="mx-auto w-full max-w-xl px-3 py-4">
      <h1 className="text-lg font-semibold text-[var(--color-fg)]">Edit {shop.displayName}</h1>
      <p className="mt-1 mb-4 text-sm text-[var(--color-fg-muted)]">Only you can see this.</p>
      <EditPageForm
        groupId={shop.groupId}
        kind={shop.kind}
        pagePath={pagePath}
        slug={shop.slug}
        initialName={shop.displayName}
        initialDescription={shop.publicDescription}
        initialSocialLinks={shop.socialLinks}
        onSave={editPageAction}
      />
    </main>
  )
}
