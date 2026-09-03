'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { MapIcon, List } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'
import { useNavVisible } from './NavVisibilityProvider'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import { ItemFeedCard } from './feed/ItemFeedCard'
import { KindFilterPills, EXPLORE_RESULTS_ID, KIND_PILL_ROW_HEIGHT } from './explore/KindFilterPills'
import { ExploreSearchBar } from './explore/ExploreSearchBar'
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

/** Height of the fixed mobile view-toggle row — a 44px touch target plus the
 *  8px band above and below it and the 1px hairline. `main` reserves this much
 *  so the last card clears it. T116 takes the row inline, and the reservation
 *  goes with it. */
const MOBILE_CONTROLS_HEIGHT = 61

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
  const navVisible = useNavVisible()

  const [query, setQuery] = useState(params.get('q') ?? '')
  const [kindFilter, setKindFilter] = useState(() => parseKindParam(params.get('kind')))
  const [view, setView] = useState<'list' | 'map'>((params.get('view') as 'list' | 'map') ?? 'list')
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
      view,
    })
    router.replace(`/explore${qs ? `?${qs}` : ''}`, { scroll: false })
  }, [query, kindFilter, secondary, view, router])

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

  // The bottom stack is nav + kind pills + the mobile view-toggle row.
  return (
    <main
      className="pb-[calc(var(--nav-height)+var(--kind-pill-row)+var(--explore-controls)+env(safe-area-inset-bottom))] md:pb-24"
      style={
        {
          '--kind-pill-row': `${KIND_PILL_ROW_HEIGHT}px`,
          '--explore-controls': `${MOBILE_CONTROLS_HEIGHT}px`,
        } as React.CSSProperties
      }
      data-testid="explore-page"
    >
      <ExploreSearchBar
        placeName={origin?.placeName ?? null}
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
                {filtered.map((item) => (
                  <li key={item.itemId}>
                    <ItemFeedCard item={item} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <section className="h-[calc(100vh-260px)]">
            <ExploreMap items={filtered} />
          </section>
        )}
      </div>

      {/* View toggle. Fixed above the kind pills on mobile — riding the same
          nav-height shift so the bottom stack moves as one — and a plain inline
          row on desktop. T116 takes the mobile half inline too. */}
      <div
        className={`fixed inset-x-0 z-30 border-t border-neutral-200 bg-white/95 px-3 py-2 backdrop-blur transition-transform duration-200 ease-out will-change-transform motion-reduce:transition-none md:static md:mx-auto md:max-w-5xl md:translate-y-0 md:border-0 md:bg-transparent md:px-6 md:pb-6 md:backdrop-blur-none ${
          navVisible ? '-translate-y-[var(--nav-height)]' : 'translate-y-0'
        }`}
        style={{ bottom: `calc(${KIND_PILL_ROW_HEIGHT}px + env(safe-area-inset-bottom))` }}
        data-testid="bottom-controls"
      >
        <div className="flex gap-2 md:justify-end">
          <ViewToggleButton icon={<List size={14} />} label="List" active={view === 'list'} onClick={() => setView('list')} />
          <ViewToggleButton icon={<MapIcon size={14} />} label="Map" active={view === 'map'} onClick={() => setView('map')} />
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

interface ViewToggleButtonProps {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}

function ViewToggleButton({ icon, label, active, onClick }: ViewToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      aria-pressed={active}
      className={`inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md text-sm md:flex-none md:px-4 ${
        active ? 'bg-[var(--color-accent)] text-white' : 'bg-neutral-100 text-neutral-700'
      }`}
    >
      {icon} {label}
    </button>
  )
}
