// #1139 — a Page's edit screen under its readable address (the owner bar links `${pagePath}/edit`). The same screen
// as /g/<id>/edit, which a draft, with no readable address yet, still uses.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { resolvePageByAddress } from '@/lib/groups/resolve-page-address'
import EditPage from '@/app/g/[handle]/edit/page'

export const dynamic = 'force-dynamic'

export default async function EditAtItsAddress({ params }: { params: Promise<{ place: string; page: string }> }) {
  const { place, page } = await params
  const shop = await resolvePageByAddress(await createClient(), place, page)
  if (!shop) notFound()
  return EditPage({ params: Promise.resolve({ handle: shop.publicId }) })
}
