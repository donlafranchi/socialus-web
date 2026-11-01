'use client'

// Don, 2026-11-01 — Airbnb's search, kept calm: a pill that reads What · Where · When, and a tap
// that opens those three plus filters. A full screen on a phone, a panel under the row from 744px.
// Every choice writes the one box (F092), so it is the same search the results already answer.
// Precedents: Airbnb web and app search, Google Maps' search field.

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { MapPin, Search, SlidersHorizontal, X } from 'lucide-react'
import { readBox } from '@/lib/browse/box-text'
import { CATEGORY_TAGS, DATE_OPTIONS, POST_KIND_OPTIONS, isPickedDay } from '@/lib/browse/filters'
import { pillSummary, toggleKind, withWhen } from '@/lib/explore/search-pill'
import { Choice, Group, Options } from '@/components/explore/choices'
import { useExploreSearch } from './explore-search'

const WIDE = '(min-width: 46.5rem)'
/** Scroll travel that folds the wide panel: a page reflowing under a search is not the person scrolling. */
const FOLD_PX = 40
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], select, textarea, [tabindex]:not([tabindex="-1"])'

export function HeaderSearch() {
  const router = useRouter()
  const live = useExploreSearch()
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<CSSProperties | undefined>()
  const pill = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const titleId = useId()

  const box = live ? live.query : draft
  const setBox = live ? live.onQueryChange : setDraft
  const tags = live?.knownTags ?? CATEGORY_TAGS
  const sum = pillSummary(box, tags, live?.areaLabel ?? null)
  const { filters } = readBox(box, tags)

  // The filter sheet wrote the box: open on it so the person reads it (F092.2). Adjusted during render.
  const focusRequest = live?.focusRequest ?? 0
  const [seenRequest, setSeenRequest] = useState(focusRequest)
  if (focusRequest !== seenRequest) {
    setSeenRequest(focusRequest)
    if (focusRequest > 0) setOpen(true)
  }

  // From 744px the panel hangs under the field; on a phone it is the whole screen. Portalled to the
  // body so no header layer or transform can cover or trap it.
  const show = () => {
    const r = pill.current?.getBoundingClientRect()
    setAnchor(r && window.matchMedia?.(WIDE).matches ? { top: r.bottom + 8, left: r.left, width: Math.max(r.width, 360) } : undefined)
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => input.current?.focus())
    // From 744px it is a panel over the page: scrolling folds it back to the pill, as Airbnb's does.
    const from = window.scrollY
    const fold = () => window.matchMedia?.(WIDE).matches && Math.abs(window.scrollY - from) > FOLD_PX && setOpen(false)
    window.addEventListener('scroll', fold, { passive: true })
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('scroll', fold)
    }
  }, [open])

  const close = () => {
    setOpen(false)
    setAnchor(undefined)
    pill.current?.focus()
  }
  const submit = () => {
    if (!live) router.push(draft.trim() ? `/explore?q=${encodeURIComponent(draft.trim())}` : '/explore')
    close()
  }
  const handOff = (to: () => void) => {
    setOpen(false)
    setAnchor(undefined)
    to()
  }

  return (
    <div className="relative min-w-0 flex-1 md:max-w-xl">
      <button
        ref={pill}
        type="button"
        data-testid="search-pill"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Search: ${sum.what}, ${sum.where}, ${sum.when}`}
        onClick={show}
        className="press flex min-h-11 w-full min-w-0 items-center gap-2 rounded-full border border-neutral-300 bg-white pl-3 pr-2 text-left text-body-sm shadow-sm hover:shadow-md"
      >
        <Search size={16} aria-hidden="true" className="shrink-0 text-[var(--color-charcoal-900)]" />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold text-[var(--color-fg)]">{sum.what}</span>
          <span aria-hidden="true" className="text-[var(--color-fg-muted)]"> · </span>
          <span className="text-[var(--color-fg-muted)]">{sum.where}</span>
          <span aria-hidden="true" className="text-[var(--color-fg-muted)]"> · </span>
          <span className="text-[var(--color-fg-muted)]">{sum.when}</span>
        </span>
        {live?.filtersActive && <span data-testid="filter-active-dot" aria-hidden="true" className="size-2 shrink-0 rounded-full bg-[var(--color-accent)]" />}
      </button>

      {open && createPortal(
        <>
          <div aria-hidden="true" onClick={close} className="fixed inset-0 z-[var(--z-sheet)] hidden bg-black/20 md:block" />
          <div
            ref={panel}
            style={anchor}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            data-testid="search-panel"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                close()
                return
              }
              if (e.key !== 'Tab') return
              const nodes = Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
              const first = nodes[0]
              const last = nodes[nodes.length - 1]
              if (!first || !last) return
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault()
                last.focus()
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault()
                first.focus()
              }
            }}
            className={`fixed inset-0 z-[var(--z-sheet)] flex flex-col bg-white md:bottom-auto md:max-h-[80dvh] ${anchor ? 'md:right-auto' : 'md:top-16 md:mx-auto md:max-w-xl'} md:rounded-2xl md:border md:border-neutral-200 md:shadow-lift`}
          >
            <div className="flex items-center justify-between gap-2 px-4 pt-2" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
              <h2 id={titleId} className="text-body font-semibold">Search</h2>
              <button type="button" aria-label="Close" onClick={close} className="press inline-flex size-11 items-center justify-center rounded-full hover:bg-neutral-100">
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <form
              role="search"
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
            >
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4">
                <Group label="What">
                  <div className="relative mb-1">
                    <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <input
                      ref={input}
                      type="search"
                      enterKeyHint="search"
                      aria-label="Search Explore"
                      placeholder="Search Pages and posts"
                      value={box}
                      onChange={(e) => setBox(e.target.value)}
                      data-testid="search-input"
                      className="min-h-11 w-full rounded-lg border border-neutral-300 py-2 pl-9 pr-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] md:text-sm"
                    />
                  </div>
                  <Options>
                    {POST_KIND_OPTIONS.map((k) => (
                      <Choice key={k.value} type="checkbox" name={`${titleId}-kind`} label={k.label} checked={filters.postKinds.includes(k.value)} onChange={() => setBox(toggleKind(box, tags, k.value))} />
                    ))}
                  </Options>
                </Group>

                {live && (
                  <Group label="Where">
                    <button type="button" data-testid="search-where" aria-haspopup="dialog" onClick={() => handOff(live.onOpenScope)} className="press flex min-h-11 w-full items-center gap-2 rounded-lg border border-neutral-300 px-3 text-left text-body-sm font-medium hover:border-neutral-500">
                      <MapPin size={16} aria-hidden="true" className="shrink-0 text-[var(--color-accent)]" />
                      <span className="truncate">{sum.where}</span>
                    </button>
                  </Group>
                )}

                <Group label="When">
                  <Options>
                    {DATE_OPTIONS.map((d) => (
                      <Choice key={d.value} name={`${titleId}-when`} label={d.label} checked={filters.date === d.value} onChange={() => setBox(withWhen(box, tags, d.value))} />
                    ))}
                    <label className="inline-flex min-h-11 items-center gap-2 text-sm text-[var(--color-fg-muted)]">
                      <span>Pick a date</span>
                      <input
                        type="date"
                        data-testid="search-when-day"
                        aria-label="Pick a date"
                        value={isPickedDay(filters.date) ? filters.date : ''}
                        onChange={(e) => setBox(withWhen(box, tags, isPickedDay(e.target.value) ? e.target.value : 'any'))}
                        className="min-w-0 bg-transparent text-sm"
                      />
                    </label>
                  </Options>
                </Group>

                {live?.onOpenFilters && (
                  <button type="button" data-testid="search-filters" aria-haspopup="dialog" aria-label={live.filtersActive ? 'More filters, filters applied' : 'More filters'} onClick={() => handOff(live.onOpenFilters!)} className="press inline-flex min-h-11 items-center gap-2 self-start text-body-sm font-medium text-[var(--color-charcoal-900)] underline underline-offset-4">
                    <SlidersHorizontal size={16} aria-hidden="true" />
                    More filters
                    {live.filtersActive && <span aria-hidden="true" className="size-2 rounded-full bg-[var(--color-accent)]" />}
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-neutral-200 px-4 py-2" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
                <button type="button" data-testid="search-clear" onClick={() => setBox('')} disabled={!box} className="press inline-flex min-h-11 items-center text-body-sm font-medium underline underline-offset-4 disabled:text-neutral-400 disabled:no-underline">
                  Clear all
                </button>
                <button type="submit" data-testid="search-submit" className="press inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--color-accent)] px-5 text-body-sm font-semibold text-white">
                  <Search size={16} aria-hidden="true" />
                  Search
                </button>
              </div>
            </form>
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}
