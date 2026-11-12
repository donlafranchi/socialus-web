// Browse. Its own surface, at its own address, rewritten in place.
//
// It is a SERVER component now. It was a client component reading
// `discoverable_items` — the Item-grain view — through `createBrowserClient`,
// which is two problems in one line: the grain is wrong (there are no Items;
// F059 asks for Pages and posts), and a surface that fetches its own rows in
// the browser cannot withhold anything. "Withheld server-side, never rendered
// and hidden" (criterion 2c) is not a property you can add to that shape
// later; resolving auth and the metro here is the prerequisite for it.
//
// Not merged into Home, and Home is not merged into this. The merge was
// rescinded 2026-09-12 — a scope cut for the launch date.

import { Suspense } from 'react'
import { loadBrowse, readSessionSeed } from './load'
import { readBox, writeBox } from '@/lib/browse/box-text'
import { parseBrowseFilters, hasBrowseFilters, CATEGORY_TAGS } from '@/lib/browse/filters'
import { parseReach } from '@/lib/browse/reach'
import { BrowseSurface } from '@/components/browse/BrowseSurface'
import { ExploreSkeleton } from '@/components/browse/ExploreSkeleton'
import { ExploreShelves } from '@/components/browse/ExploreShelves'
import { ExploreMemberPosts } from '@/components/member-posts/ExploreMemberPosts'
import { countUse, partsForExplore } from '@/lib/usage/count-use'

export const dynamic = 'force-dynamic'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ metro?: string; area?: string; q?: string; view?: string; schedule?: string; category?: string; reach?: string }>
}) {
  const sp = await searchParams
  // #876 — a link that carries filters opens on the targeted read, not on a client cut of the mix.
  const params = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === 'string'))
  const { filters, rest } = readBox(writeBox(parseBrowseFilters(params), sp.q ?? ''), CATEGORY_TAGS)
  // F133 — Explore, the map or a search, counted after the response for a signed-in member; alongside the read, not before it.
  const [snapshot] = await Promise.all([
    loadBrowse(sp.metro ?? null, sp.area ?? null, { withMap: false, seed: await readSessionSeed(), filters, reach: parseReach(sp.reach) }),
    ...partsForExplore(sp).map((part) => countUse({ part })),
  ])

  return (
    <Suspense fallback={<ExploreSkeleton />}>
      <BrowseSurface
        initial={snapshot}
        shelves={
          // F121 — signed in only (a stranger's feed carries no posts); streamed, so Explore never waits for them.
          // Only the default view shows them, so only it reads them: a search, filter or the map never does.
          snapshot.signedIn && snapshot.metro && !hasBrowseFilters(filters) && !rest.trim() && sp.view !== 'map' ? (
            <>
              <Suspense fallback={null}>
                <ExploreShelves scope={snapshot.area ? { placeId: snapshot.area.id } : { metroId: snapshot.metro.id }} />
              </Suspense>
              {/* #1183 — posts from members, in rows of their own. */}
              <Suspense fallback={null}>
                <ExploreMemberPosts scope={snapshot.area ? { placeId: snapshot.area.id } : { metroId: snapshot.metro.id }} />
              </Suspense>
            </>
          ) : null
        }
      />
    </Suspense>
  )
}
