'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, X, MapIcon, List } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'
import { useNavVisible } from './NavVisibilityProvider'
import { ItemFeedCard } from './feed/ItemFeedCard'
import { KindFilterPills, EXPLORE_RESULTS_ID, KIND_PILL_ROW_HEIGHT } from './explore/KindFilterPills'
import { parseKindParam, kindTabId } from '@/lib/explore/kinds'
import { exploreQueryString } from '@/lib/explore/query'
import {
  fetchExploreItems,
  searchExploreItems,
  exploreCategoryOptions,
  categoryLabel,
  type ExploreItem,
} from '@/lib/explore/items'

const ExploreMap = dynamic(() => import('./ExploreMap').then((m) => m.ExploreMap), { ssr: false })

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
  const [categoryFilter, setCategoryFilter] = useState<string | null>(params.get('category'))

  const [items, setItems] = useState<ExploreItem[]>([])
  const [loaded, setLoaded] = useState(false)

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

  useEffect(() => {
    const qs = exploreQueryString({
      q: query,
      kind: kindFilter,
      category: categoryFilter,
      view,
    })
    router.replace(`/explore${qs ? `?${qs}` : ''}`, { scroll: false })
  }, [query, kindFilter, categoryFilter, view, router])

  const filtered = useMemo(
    () => searchExploreItems(items, { q: query, category: categoryFilter }),
    [items, query, categoryFilter]
  )
  const categories = useMemo(() => exploreCategoryOptions(items), [items])

  const clearAll = () => {
    setQuery('')
    setKindFilter(null)
    setCategoryFilter(null)
  }

  // The main padding reserves the whole bottom stack: nav + kind pills + the 116px
  // mobile control cluster (view toggle + search). T115/T116 move those two rows.
  return (
    <main
      className="pb-[calc(var(--nav-height)+var(--kind-pill-row)+116px+env(safe-area-inset-bottom))] md:pb-24"
      style={{ '--kind-pill-row': `${KIND_PILL_ROW_HEIGHT}px` } as React.CSSProperties}
      data-testid="explore-page"
    >
      {/* Desktop top header */}
      <header className="hidden md:block sticky top-14 z-20 bg-white border-b border-neutral-200">
        <div className="max-w-5xl mx-auto p-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="search"
              placeholder="Search events, products, services, ideas"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="search-input-desktop"
              className="w-full pl-9 pr-9 py-2.5 text-sm border border-neutral-300 rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>
          <div className="mt-3 flex gap-2 items-center">
            <FilterChip
              label={categoryFilter ? categoryLabel(categoryFilter) : 'Category'}
              active={!!categoryFilter}
              onClear={categoryFilter ? () => setCategoryFilter(null) : undefined}
              menuItems={categories.map((slug) => ({
                label: categoryLabel(slug),
                onSelect: () => setCategoryFilter(slug),
                selected: categoryFilter === slug,
              }))}
            />
            <div className="ml-auto flex gap-1">
              <button
                type="button"
                onClick={() => setView('list')}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md ${
                  view === 'list' ? 'bg-[var(--color-accent)] text-white' : 'bg-neutral-100 text-neutral-700'
                }`}
              >
                <List size={14} /> List
              </button>
              <button
                type="button"
                onClick={() => setView('map')}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md ${
                  view === 'map' ? 'bg-[var(--color-accent)] text-white' : 'bg-neutral-100 text-neutral-700'
                }`}
              >
                <MapIcon size={14} /> Map
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile bottom-anchored controls — stacked above the kind pills, riding the
          same nav-height shift so the cluster stays glued to the pill row. */}
      <div
        className={`fixed inset-x-0 z-30 md:hidden bg-white/95 backdrop-blur border-t border-neutral-200 transition-transform duration-200 ease-out will-change-transform motion-reduce:transition-none ${
          navVisible ? '-translate-y-[var(--nav-height)]' : 'translate-y-0'
        }`}
        style={{ bottom: `calc(${KIND_PILL_ROW_HEIGHT}px + env(safe-area-inset-bottom))` }}
        data-testid="bottom-controls"
      >
        {/* View toggle row (top of stack) */}
        <div className="px-3 pt-2 pb-1 flex gap-2">
          <button
            type="button"
            onClick={() => setView('list')}
            data-active={view === 'list'}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 text-sm rounded-md ${
              view === 'list' ? 'bg-[var(--color-accent)] text-white' : 'bg-neutral-100 text-neutral-700'
            }`}
          >
            <List size={14} /> List
          </button>
          <button
            type="button"
            onClick={() => setView('map')}
            data-active={view === 'map'}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 text-sm rounded-md ${
              view === 'map' ? 'bg-[var(--color-accent)] text-white' : 'bg-neutral-100 text-neutral-700'
            }`}
          >
            <MapIcon size={14} /> Map
          </button>
        </div>

        {/* Search input row (closest to nav, easiest thumb reach) */}
        <div className="px-3 pb-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="search"
              placeholder="Search events, products, services, ideas"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="search-input"
              className="w-full pl-9 pr-9 py-2.5 text-sm border border-neutral-300 rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

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

      <KindFilterPills selected={kindFilter} onSelect={setKindFilter} />
    </main>
  )
}

interface FilterChipProps {
  label: string
  active: boolean
  onClear?: () => void
  menuItems: { label: string; onSelect: () => void; selected: boolean }[]
  placement?: 'bottom' | 'top'
}

function FilterChip({ label, active, onClear, menuItems, placement = 'bottom' }: FilterChipProps) {
  const [open, setOpen] = useState(false)
  const menuPosClasses =
    placement === 'top' ? 'absolute z-50 bottom-full mb-1' : 'absolute z-50 top-full mt-1'
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium border transition-colors whitespace-nowrap ${
          active ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]' : 'bg-white text-neutral-700 border-neutral-300'
        }`}
      >
        {label}
        {active && onClear && (
          <span
            onClick={(e) => {
              e.stopPropagation()
              onClear()
              setOpen(false)
            }}
            className="ml-1"
            role="button"
          >
            <X size={12} />
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={`${menuPosClasses} w-48 bg-white rounded-lg border border-neutral-200 shadow-lg max-h-64 overflow-y-auto`}>
            {menuItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  item.onSelect()
                  setOpen(false)
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-neutral-100 ${
                  item.selected ? 'font-medium text-[var(--color-accent)]' : 'text-neutral-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
