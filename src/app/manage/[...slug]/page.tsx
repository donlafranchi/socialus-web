// The old owner surface, kept only to forward.
//
// Issue #175 — editing hangs off the Page's canonical address now
// (`/g/<slug>-<id>/edit`). `/manage/<slug>` shipped days ago and was never a
// public address anybody shared, but a bookmark costs one redirect and a 404
// costs an owner their Page.

import { notFound, permanentRedirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { resolveShop } from '@/lib/groups/resolve-shop'
import { canonicalPagePath } from '@/lib/groups/page-handle'

export const dynamic = 'force-dynamic'

export default async function ManageRedirect({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  const supabase = await createClient()
  const shop = await resolveShop(supabase, slug[slug.length - 1])
  if (!shop || shop.lifecycleState === 'dissolved') notFound()
  permanentRedirect(`${canonicalPagePath(shop.publicId)}/edit`)
}
