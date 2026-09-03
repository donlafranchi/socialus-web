'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, X, MapIcon, List } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'
import type { Vendor, Market, VendorCategory, WeekdaySlug } from '@/lib/types'
import { CATEGORIES, CATEGORY_ORDER, type CategorySlug } from '@/lib/categories'
import { WEEKDAYS } from '@/lib/types'
import { useMarket } from './MarketContext'
import { useNavVisible } from './NavVisibilityProvider'
import { VendorCard } from './VendorCard'
import { MarketPill } from './MarketPill'
import { RecruitmentGrid } from './RecruitmentGrid'
import { KindFilterPills, EXPLORE_RESULTS_ID, KIND_PILL_ROW_HEIGHT } from './explore/KindFilterPills'
import { parseKindParam, kindTabId } from '@/lib/explore/kinds'
import { exploreQueryString } from '@/lib/explore/query'

const ExploreMap = dynamic(() => import('./ExploreMap').then((m) => m.ExploreMap), { ssr: false })

function supabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}


interface VendorRow {
  vendor: Vendor
  primaryCategory: string | null
  marketIds: string[]
}

export function ExplorePage() {
  const router = useRouter()
  const params = useSearchParams()
  const { selectedMarket, allMarkets } = useMarket()
  const navVisible = useNavVisible()

  const [query, setQuery] = useState(params.get('q') ?? '')
  const [kindFilter, setKindFilter] = useState(() => parseKindParam(params.get('kind')))
  const [view, setView] = useState<'list' | 'map'>((params.get('view') as 'list' | 'map') ?? 'list')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(params.get('category'))
  const [marketSlugFilter, setMarketSlugFilter] = useState<string | null>(params.get('market'))
  const [dayFilter, setDayFilter] = useState<WeekdaySlug | null>((params.get('day') as WeekdaySlug) ?? null)

  const [vendors, setVendors] = useState<VendorRow[]>([])
  const [loaded, setLoaded] = useState(false)

  const marketBySlug = useMemo(() => new Map(allMarkets.map((m) => [m.slug, m])), [allMarkets])
  const marketById = useMemo(() => new Map(allMarkets.map((m) => [m.id, m])), [allMarkets])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const client = supabase()
      const [{ data: vRows }, { data: cRows }, { data: mvRows }] = await Promise.all([
        client.from('businesses').select('*'),
        client.from('vendor_categories').select('*'),
        client.from('market_vendors').select('vendor_id, market_id'),
      ])
      if (cancelled) return
      const allVendors = (vRows ?? []) as Vendor[]
      const allCats = (cRows ?? []) as VendorCategory[]
      const allLinks = (mvRows ?? []) as { vendor_id: string; market_id: string }[]

      const rows = allVendors.map((v) => {
        const myCats = allCats.filter((c) => c.vendor_id === v.id)
        const primary = myCats.find((c) => c.is_primary)?.category_slug ?? myCats[0]?.category_slug ?? null
        const marketIds = allLinks.filter((l) => l.vendor_id === v.id).map((l) => l.market_id)
        return { vendor: v, primaryCategory: primary, marketIds }
      })
      setVendors(rows)
      setLoaded(true)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const qs = exploreQueryString({
      q: query,
      kind: kindFilter,
      category: categoryFilter,
      market: marketSlugFilter,
      day: dayFilter,
      view,
    })
    router.replace(`/explore${qs ? `?${qs}` : ''}`, { scroll: false })
  }, [query, kindFilter, categoryFilter, marketSlugFilter, dayFilter, view, router])

  const effectiveMarketSlug = marketSlugFilter ?? selectedMarket?.slug ?? null
  const effectiveMarket = effectiveMarketSlug ? marketBySlug.get(effectiveMarketSlug) ?? null : null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return vendors.filter((row) => {
      // Explore still lists vendors (`businesses`), which carry no `items.kind`.
      // The pill selection narrows the result set here; until these results are
      // items-backed, every non-All kind resolves to zero rows — see DEVIATIONS (T114).
      if (kindFilter) return false
      if (categoryFilter && row.primaryCategory !== categoryFilter) {
        const cats = vendors.find((v) => v.vendor.id === row.vendor.id)
        if (!cats) return false
      }
      if (categoryFilter) {
        const cat = row.primaryCategory
        if (cat !== categoryFilter) return false
      }
      if (effectiveMarket) {
        if (!row.marketIds.includes(effectiveMarket.id)) return false
      }
      if (dayFilter) {
        const matchedAny = row.marketIds.some((id) => marketById.get(id)?.schedule_days.includes(dayFilter))
        if (!matchedAny) return false
      }
      if (q) {
        const hay = `${row.vendor.name} ${row.vendor.tagline ?? ''} ${row.primaryCategory ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [vendors, query, kindFilter, categoryFilter, effectiveMarket, dayFilter, marketById])

  const showEmptyState = !query && !kindFilter && !categoryFilter && !marketSlugFilter && !dayFilter

  const clearAll = () => {
    setQuery('')
    setKindFilter(null)
    setCategoryFilter(null)
    setMarketSlugFilter(null)
    setDayFilter(null)
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
              placeholder="Search vendors, products, markets"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="search-input-desktop"
              className="w-full pl-9 pr-9 py-2.5 text-sm border border-neutral-300 rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>
          <div className="mt-3 flex gap-2 items-center">
            <MarketPill />
            <FilterChip
              label={categoryFilter ? CATEGORIES[categoryFilter as CategorySlug]?.label ?? 'Category' : 'Category'}
              active={!!categoryFilter}
              onClear={categoryFilter ? () => setCategoryFilter(null) : undefined}
              menuItems={CATEGORY_ORDER.map((slug) => ({
                label: `${CATEGORIES[slug].emoji} ${CATEGORIES[slug].label}`,
                onSelect: () => setCategoryFilter(slug),
                selected: categoryFilter === slug,
              }))}
            />
            <FilterChip
              label={dayFilter ? WEEKDAYS.find((w) => w.slug === dayFilter)?.short ?? 'Day' : 'Day'}
              active={!!dayFilter}
              onClear={dayFilter ? () => setDayFilter(null) : undefined}
              menuItems={WEEKDAYS.map((w) => ({
                label: w.long,
                onSelect: () => setDayFilter(w.slug),
                selected: dayFilter === w.slug,
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
              placeholder="Search vendors, products, markets"
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
        {showEmptyState ? (
          <RecruitmentGrid />
        ) : view === 'list' ? (
          <section className="px-3 md:px-6 py-4">
            <p className="text-sm text-neutral-600 mb-3" data-testid="result-count">
              {loaded ? (
                <>
                  {filtered.length} vendor{filtered.length === 1 ? '' : 's'}
                  {query && <> match &ldquo;{query}&rdquo;</>}
                </>
              ) : (
                'Loading…'
              )}
            </p>
            {filtered.length === 0 && loaded ? (
              <div className="text-center py-12 text-sm text-neutral-600">
                <p>No vendors match your filters.</p>
                <button onClick={clearAll} className="mt-2 text-[var(--color-accent)] underline">
                  Clear filters
                </button>
              </div>
            ) : (
              <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filtered.map((row) => (
                  <li key={row.vendor.id}>
                    <VendorCard vendor={row.vendor} primaryCategory={row.primaryCategory} compact />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <section className="h-[calc(100vh-260px)]">
            <ExploreMap vendors={filtered.map((r) => ({ vendor: r.vendor, primaryCategory: r.primaryCategory }))} />
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
