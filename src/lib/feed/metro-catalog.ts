// #978 — every metro, read once and shared. It is public and changes by hand, so Explore stopped
// reading 297 rows (and a second lookup for the one in scope) on every tap.

import { unstable_cache } from 'next/cache'
import { createAnonClient } from '@/lib/supabase-anon'
import { listFeedMetros, type FeedMetro } from './feed-metro'

export const METRO_CATALOG_TTL_SECONDS = 300

export const cachedMetros: () => Promise<FeedMetro[]> = unstable_cache(
  () => listFeedMetros(createAnonClient()),
  ['metro-catalog-v1'],
  { revalidate: METRO_CATALOG_TTL_SECONDS },
)
