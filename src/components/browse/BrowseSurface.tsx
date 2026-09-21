'use client'

// Browse's client body. It holds control state — query, filters, view — and
// nothing else: the metro, the rows and the auth state are resolved on the
// server and arrive as props.
//
// WHAT IS NOT ON THIS SURFACE. No filter pills, no chip row, at any viewport
// width (ruled 2026-09-12: zero filter pills outside the filter view; the
// ruling is about the results surface, not about how wide the screen is).
// Filtering happens in the filter sheet. Free-text search stays here, because
// search is for finding something specific and a lens is for being shown
// something — different jobs, different places.
//
// What replaces the pill row is deliberately NOT decided here. Curated lenses
// (F059 criterion 4) are a research pass that has not landed, and picking a
// shape in a build ticket would answer by implementation a question recorded
// as open. So this ships the constraint — no pills — and no replacement.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import { MakeThisYoursBanner } from '@/components/feed/MakeThisYoursBanner'
import { CardGrid } from '@/components/cards'
import { ExploreSearchBar } from '@/components/explore/ExploreSearchBar'
import { ExploreFilterSheet } from '@/components/explore/ExploreFilterSheet'
import { ListMapToggle, type ExploreView } from '@/components/explore/ListMapToggle'
import { ScopeSheet } from '@/components/explore/ScopeSheet'
import { BrowseResultCard } from './BrowseResultCard'
import { BROWSE_RESULTS_ID } from './results-id'
import { browseQueryString } from '@/lib/browse/query'
import {
  DEFAULT_BROWSE_FILTERS,
  applyBrowseFilters,
  browseTagOptions,
  hasBrowseFilters,
  parseBrowseFilters,
  searchBrowseResults,
} from '@/lib/browse/filters'
import { browseFeedAction } from '@/app/explore/actions'
import type { BrowseSnapshot } from '@/lib/browse/snapshot'
import type { FeedMetro } from '@/lib/feed/feed-metro'

const BrowseMap = dynamic(() => import('./BrowseMap').then((m) => m.BrowseMap), { ssr: false })

/** Cards before the inline toggle interrupts the grid. Ported unchanged from
 *  T116 — four completes a row at both 2 and 4 columns, so the toggle never
 *  lands beside a half-empty row. Not re-derived. */
const TOGGLE_AFTER_CARDS = 4

/** Long enough that a five-character search announces once, on settle. */
const ANNOUNCE_DEBOUNCE_MS = 700

export function BrowseSurface({ initial }: { initial: BrowseSnapshot }) {
  const router = useRouter()
  const params = useSearchParams()

  const [snapshot, setSnapshot] = useState(initial)
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [filters, setFilters] = useState(() => parseBrowseFilters(params))
  // Ephemeral per F044 — not in the URL, resets to List on the next visit.
  const [view, setView] = useState<ExploreView>('list')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [scopeOpen, setScopeOpen] = useState(false)
  const [, startTransition] = useTransition()
  // One clock per mount, so the week/weekend boundaries stay stable across
  // renders instead of shifting under a memo.
  const [now] = useState(() => new Date())

  // A slow earlier response must never overwrite a newer one. The guard
  // survives the port because the race did: two metro taps in a second still
  // resolve in whatever order the network feels like.
  const requestRef = useRef(0)

  const chooseMetro = useCallback((metro: FeedMetro) => {
    setScopeOpen(false)
    const request = ++requestRef.current
    startTransition(async () => {
      try {
        const next = await browseFeedAction(metro.slug)
        // The previous page stays on screen until this line. A metro change is
        // a change of scope, not a page load.
        if (requestRef.current === request) setSnapshot(next)
      } catch {
        // `loadBrowse` swallows a failed feed read into `failed`, so reaching
        // here means the action itself did not come back. Say so on the
        // surface rather than leaving the old metro's rows under the new
        // metro's name.
        if (requestRef.current === request) {
          setSnapshot((s) => ({ ...s, results: [], failed: true }))
        }
      }
    })
  }, [])

  const metroSlug = snapshot.chosen ? (snapshot.metro?.slug ?? null) : null

  useEffect(() => {
    const qs = browseQueryString({
      metro: metroSlug,
      q: query,
      tags: filters.tags,
      schedule: filters.schedule,
    })
    router.replace(`/explore${qs ? `?${qs}` : ''}`, { scroll: false })
  }, [metroSlug, query, filters, router])

  const visible = useMemo(
    () => applyBrowseFilters(searchBrowseResults(snapshot.results, query), filters, { now }),
    [snapshot.results, query, filters, now],
  )

  const tagOptions = useMemo(() => browseTagOptions(snapshot.results), [snapshot.results])

  useScrollRestoration('explore', visible.length > 0)

  const metroName = snapshot.metro?.name ?? null

  // One live region for both announcements — the result count and the metro.
  // Debounced so a five-character search announces once rather than five
  // times, and so switching metro does not race the count that follows it.
  const [announcement, setAnnouncement] = useState('')
  useEffect(() => {
    const message = metroName
      ? `${visible.length} result${visible.length === 1 ? '' : 's'} in ${metroName}`
      : `${visible.length} result${visible.length === 1 ? '' : 's'}`
    const id = setTimeout(() => setAnnouncement(message), ANNOUNCE_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [visible.length, metroName])

  const clearAll = () => {
    setQuery('')
    setFilters(DEFAULT_BROWSE_FILTERS)
  }

  // Nothing resolvable to browse. The controls are suppressed rather than
  // rendered inert: a scope picker is the one thing that could help, and it is
  // in the panel itself.
  if (!snapshot.metro) {
    return (
      <main className="pb-[calc(var(--nav-height)+env(safe-area-inset-bottom))] md:pb-24" data-testid="browse-page">
        <div className="mx-auto max-w-xl px-3 py-10 md:px-6">
          <div className="card p-6 text-center" data-testid="feed-no-place">
            <p className="text-sm text-[var(--color-fg)]">
              We don&rsquo;t know which area to show you yet.
            </p>
            <button
              type="button"
              onClick={() => setScopeOpen(true)}
              className="press mt-3 inline-flex min-h-11 items-center text-sm font-medium text-[var(--color-charcoal-900)] underline"
            >
              Choose your area
            </button>
          </div>
        </div>
        <ScopeSheet
          open={scopeOpen}
          currentSlug={null}
          metros={snapshot.metros}
          onClose={() => setScopeOpen(false)}
          onChoose={chooseMetro}
        />
      </main>
    )
  }

  return (
    <main
      className="pb-[calc(var(--nav-height)+env(safe-area-inset-bottom))] md:pb-24"
      data-testid="browse-page"
    >
      <ExploreSearchBar
        placeName={metroName}
        placeChosen={snapshot.chosen}
        query={query}
        onQueryChange={setQuery}
        filtersActive={hasBrowseFilters(filters)}
        onOpenFilters={() => setSheetOpen(true)}
        onOpenScope={() => setScopeOpen(true)}
      />

      {/* Above the results, and absent for a signed-in Member. */}
      {!snapshot.signedIn && <MakeThisYoursBanner isAuthenticated={false} />}

      <p className="sr-only" role="status" aria-live="polite" data-testid="browse-announcement">
        {announcement}
      </p>

      {/* A region, not a tabpanel: the pill row that made it one is gone, and
          a panel with no tabs of its own is a lie to a screen reader. */}
      <div
        id={BROWSE_RESULTS_ID}
        role="region"
        aria-label={`Results in ${metroName}`}
        data-testid="browse-results"
      >
        {/* Keyed on the view so the fade replays on each switch. */}
        <div key={view} data-testid="browse-view-pane" className="explore-fade-in">
          {view === 'list' ? (
            <section className="px-3 py-4 md:px-6">
              <p className="mb-3 text-sm text-neutral-600" data-testid="result-count">
                {visible.length} result{visible.length === 1 ? '' : 's'}
                {query && <> match &ldquo;{query}&rdquo;</>}
              </p>

              {snapshot.failed ? (
                <div className="py-12 text-center text-sm text-neutral-600" data-testid="browse-error">
                  <p>We couldn&rsquo;t load {metroName} just now. Try again in a moment.</p>
                </div>
              ) : visible.length === 0 ? (
                <div className="py-12 text-center text-sm text-neutral-600" data-testid="browse-empty">
                  <p>Nothing here yet — try another filter</p>
                  {/* Charcoal, not the accent token: `--color-accent` on
                      white is 2.9:1, short of AA for 14px text. The filter
                      sheet's "Clear all" took the same resolution — the
                      token's on-white contrast is an app-wide question, and
                      this surface does not settle it. */}
                  <button
                    type="button"
                    onClick={clearAll}
                    className="press mt-2 inline-flex min-h-11 items-center font-medium text-[var(--color-charcoal-900)] underline"
                  >
                    Clear filters
                  </button>
                  {/* Secondary, beneath — a wider area is the other answer to
                      an empty metro, and it is not the first one to offer. */}
                  <p className="mt-3">
                    <button
                      type="button"
                      onClick={() => setScopeOpen(true)}
                      data-testid="browse-widen"
                      className="press inline-flex min-h-11 items-center text-[var(--color-fg-muted)] underline"
                    >
                      Or look at another area
                    </button>
                  </p>
                </div>
              ) : (
                <CardGrid>
                  {visible.slice(0, TOGGLE_AFTER_CARDS).map((r) => (
                    <BrowseResultCard key={`${r.resultKind}:${r.resultId}`} result={r} />
                  ))}
                  {/* The toggle interrupts the grid rather than following it,
                      so it lands where the member is already scrolling.
                      `presentation` keeps it out of the list's item count. */}
                  <li role="presentation" className="col-span-full">
                    <ListMapToggle view={view} onChange={setView} />
                  </li>
                  {visible.slice(TOGGLE_AFTER_CARDS).map((r) => (
                    <BrowseResultCard key={`${r.resultKind}:${r.resultId}`} result={r} />
                  ))}
                </CardGrid>
              )}

              {/* No cards to interrupt — the toggle still renders, because the
                  map shows the search area even with nothing in it. */}
              {visible.length === 0 && <ListMapToggle view={view} onChange={setView} />}
            </section>
          ) : (
            <section className="px-3 py-4 md:px-6">
              {/* 70vh leaves the toggle below the map on screen without a
                  scroll, at every viewport height. */}
              <div className="h-[70vh] overflow-hidden rounded-xl">
                <BrowseMap results={visible} />
              </div>
              <ListMapToggle view={view} onChange={setView} />
            </section>
          )}
        </div>
      </div>

      <ScopeSheet
        open={scopeOpen}
        currentSlug={snapshot.metro.slug}
        metros={snapshot.metros}
        onClose={() => setScopeOpen(false)}
        onChoose={chooseMetro}
      />

      <ExploreFilterSheet
        open={sheetOpen}
        value={filters}
        tags={tagOptions}
        onClose={() => setSheetOpen(false)}
        onApply={setFilters}
      />
    </main>
  )
}
