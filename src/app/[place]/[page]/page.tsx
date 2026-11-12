// #1139 (Don, 2026-11-01) — a Page at its address: /<place>-<st>/<page-slug>, e.g. /sacramento-ca/plant-foundry. The
// place is the Page's home town, frozen at first publish; the real address shows on the Page. Static top-level routes
// win over this one, and no place or Page may take their names (url_reserved). /g/<id> forwards here.

import { cache, Suspense } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { resolvePageByAddress } from '@/lib/groups/resolve-page-address'
import { PageSkeleton } from '@/components/group/PageSkeleton'
import { shareMetadata } from '@/lib/groups/share-metadata'
import { PageBody } from '@/app/g/[handle]/page-body'

interface Props {
  params: Promise<{ place: string; page: string }>
}

const shopFor = cache(async (place: string, page: string) => resolvePageByAddress(await createClient(), place, page))

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { place, page } = await params
  const shop = await shopFor(place, page)
  if (!shop) return { title: 'Not found — SocialUs' }
  return shareMetadata(shop)
}

export default async function PageAtItsAddress({ params }: Props) {
  const { place, page } = await params
  const shop = await shopFor(place, page)
  if (!shop) notFound()
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PageBody shop={shop} />
    </Suspense>
  )
}
