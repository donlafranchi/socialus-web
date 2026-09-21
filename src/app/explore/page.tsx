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
import { loadBrowse } from './load'
import { BrowseSurface } from '@/components/browse/BrowseSurface'

export const dynamic = 'force-dynamic'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ metro?: string }>
}) {
  const { metro } = await searchParams
  const snapshot = await loadBrowse(metro ?? null)

  return (
    <Suspense fallback={<div className="p-4">Loading…</div>}>
      <BrowseSurface initial={snapshot} />
    </Suspense>
  )
}
