'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import { ItemFeedCard } from './feed/ItemFeedCard'
import { KindFilterPills, EXPLORE_RESULTS_ID, KIND_PILL_ROW_HEIGHT } from './explore/KindFilterPills'
import { ExploreSearchBar } from './explore/ExploreSearchBar'
import { ListMapToggle, type ExploreView } from './explore/ListMapToggle'
import { ExploreFilterSheet } from './explore/ExploreFilterSheet'
import { ActiveFilterChips } from './explore/ActiveFilterChips'
import { parseKindParam, kindTabId } from '@/lib/explore/kinds'
import { exploreQueryString } from '@/lib/explore/query'
import {
  DEFAULT_SECONDARY,
  applySecondaryFilters,
  hasSecondaryFilters,
  parseSecondaryFilters,
  removeFilter,
  sortExploreItems,
} from '@/lib/explore/filters'
import { fetchExploreOrigin, type ExploreOrigin } from '@/lib/explore/origin'
import {
  fetchExploreItems,
  fetchRecurringGatheringIds,
  searchExploreItems,
  exploreCategoryOptions,
  type ExploreItem,
} from '@/lib/explore/items'

const ExploreMap = dynamic(() => import('./ExploreMap').then((m) => m.ExploreMap), { ssr: false })

/** Cards to show before the inline toggle interrupts the grid (F044: "after
 *  cards 3-5"). Four completes a row at both 2 and 4 columns, so the toggle
 *  never lands beside a half-empty row. */
const TOGGLE_AFTER_CARDS = 4

const NO_RECURRING: ReadonlySet<string> = new Set()

function supabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}

export function ExplorePage() {
  const router = useRouter()
  const params = useSearchParams()

  const [query, setQuery] = useState(params.get('q') ?? '')
  const [kindFilter, setKindFilter] = useState(() => parseKindParam(params.get('kind')))
  // Ephemeral per F044 § Out of Scope — not in the URL, resets to List on the
  // next visit. Persisting the preference across sessions is b2.
  const [view, setView] = useState<ExploreView>('list')
  const [secondary, setSecondary] = useState(() => parseSecondaryFilters(params))
  const [sheetOpen, setSheetOpen] = useState(false)

  const [items, setItems] = useState<ExploreItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [origin, setOrigin] = useState<ExploreOrigin | null>(null)
  const [recurringIds, setRecurringIds] = useState<ReadonlySet<string>>(NO_RECURRING)
  // One clock per mount, so the week/weekend boundaries stay stable across
  // renders instead of shifting under a memo.
  const [now] = useState(() => new Date())

  // Kind is filtered server-side on the MV's indexed `item_kind`, so each pill
  // tap refetches. The previous page stays on screen until the next resolves —
  // a pill tap should read as a filter, not a page load (T114 AC "instantly").
  const requestRef = useRef(0)
  useEffect(() => {
    const request = ++requestRef.current
    fetchExploreItems(supabase(), { kind: kindFilter })
      .catch(() => [] as ExploreItem[])
      .then((rows) => {
        if (requestRef.current !== request) return
        setItems(rows)
        setLoaded(true)
      })
  }, [kindFilter])

  // The locality (search-row label + the point distances are measured from) and
  // the recurring set are page-lifetime facts — fetched once, not per pill tap.
  useEffect(() => {
    const client = supabase()
    fetchExploreOrigin(client).then(setOrigin)
    fetchRecurringGatheringIds(client).then(setRecurringIds)
  }, [])

  useEffect(() => {
    const qs = exploreQueryString({
      q: query,
      kind: kindFilter,
      categories: secondary.categories,
      distance: secondary.distance,
      schedule: secondary.schedule,
      sort: secondary.sort,
    })
    router.replace(`/explore${qs ? `?${qs}` : ''}`, { scroll: false })
  }, [query, kindFilter, secondary, router])

  const originPoint = origin?.point ?? null

  const filtered = useMemo(() => {
    const searched = searchExploreItems(items, { q: query })
    const narrowed = applySecondaryFilters(searched, secondary, {
      origin: originPoint,
      now,
      recurringIds,
    })
    return sortExploreItems(narrowed, secondary.sort, { origin: originPoint })
  }, [items, query, secondary, originPoint, now, recurringIds])

  const categories = useMemo(() => exploreCategoryOptions(items), [items])

  useScrollRestoration('explore', loaded && filtered.length > 0)

  const clearAll = () => {
    setQuery('')
    setKindFilter(null)
    setSecondary(DEFAULT_SECONDARY)
  }

  // The bottom stack is nav + kind pills. The view toggle is inline (T116).
  return (
    <main
      className="pb-[calc(var(--nav-height)+var(--kind-pill-row)+env(safe-area-inset-bottom))] md:pb-24"
      style={{ '--kind-pill-row': `${KIND_PILL_ROW_HEIGHT}px` } as React.CSSProperties}
      data-testid="explore-page"
    >
      <ExploreSearchBar
        placeName={origin?.placeName ?? null}
        placeChosen={origin?.chosen ?? false}
        query={query}
        onQueryChange={setQuery}
        filtersActive={hasSecondaryFilters(secondary)}
        onOpenFilters={() => setSheetOpen(true)}
      />

      {/* Not sticky, by design: the chips scroll away and the dot on the filter
          icon is what keeps the filtered state visible. */}
      <ActiveFilterChips
        filters={secondary}
        onRemove={(id) => setSecondary((f) => removeFilter(f, id))}
      />

      <div id={EXPLORE_RESULTS_ID} role="tabpanel" aria-labelledby={kindTabId(kindFilter)}>
        {/* Keyed on the view so the fade replays on each switch — a 200ms
            opacity ease, not a navigation. */}
        <div key={view} data-testid="explore-view-pane" className="explore-fade-in">
          {view === 'list' ? (
            <section className="px-3 md:px-6 py-4">
              <p className="text-sm text-neutral-600 mb-3" data-testid="result-count" aria-live="polite">
                {loaded ? (
                  <>
                    {filtered.length} item{filtered.length === 1 ? '' : 's'}
                    {query && <> match &ldquo;{query}&rdquo;</>}
                  </>
                ) : (
                  'Loading…'
                )}
              </p>
              {filtered.length === 0 && loaded ? (
                <div className="text-center py-12 text-sm text-neutral-600" data-testid="explore-empty">
                  <p>Nothing here yet — try another filter.</p>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="mt-2 text-[var(--color-accent)] underline"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {filtered.slice(0, TOGGLE_AFTER_CARDS).map((item) => (
                    <li key={item.itemId}>
                      <ItemFeedCard item={item} />
                    </li>
                  ))}
                  {/* The toggle interrupts the grid rather than following it, so
                      it lands where the member is already scrolling. `presentation`
                      keeps it out of the list's item count. Held back until the
                      first page lands — rendering it against an empty grid puts
                      it at the top of the page, then shoves it down four cards
                      when the results arrive. */}
                  {loaded && (
                    <li role="presentation" className="col-span-full">
                      <ListMapToggle view={view} onChange={setView} />
                    </li>
                  )}
                  {filtered.slice(TOGGLE_AFTER_CARDS).map((item) => (
                    <li key={item.itemId}>
                      <ItemFeedCard item={item} />
                    </li>
                  ))}
                </ul>
              )}
              {/* No cards to interrupt — the toggle still renders, because the
                  map shows the search area even with nothing in it. */}
              {filtered.length === 0 && loaded && <ListMapToggle view={view} onChange={setView} />}
            </section>
          ) : (
            <section className="px-3 md:px-6 py-4">
              {/* 70vh leaves the toggle below the map on screen without a
                  scroll, at every viewport height. */}
              <div className="h-[70vh] overflow-hidden rounded-xl">
                <ExploreMap items={filtered} />
              </div>
              <ListMapToggle view={view} onChange={setView} />
            </section>
          )}
        </div>
      </div>

      <KindFilterPills selected={kindFilter} onSelect={setKindFilter} />

      <ExploreFilterSheet
        open={sheetOpen}
        value={secondary}
        categories={categories}
        originAvailable={originPoint !== null}
        onClose={() => setSheetOpen(false)}
        onApply={setSecondary}
      />
    </main>
  )
}
