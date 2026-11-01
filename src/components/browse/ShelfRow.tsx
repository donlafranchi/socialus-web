'use client'

// Don (2026-11-01): a shelf should "not continue on a new line and instead scroll off the page", with arrows or a
// tap on the shelf to open "a longer list". The App Store's shelf (Apple HIG, Collections): one row that scrolls
// sideways, its title and "See all" open the full list as its own screen. Arrows from 768px; a phone swipes.
// One type per row (Pages or posts, never both) is the caller's job. Draft copy (human-review).

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { CardGrid } from '@/components/cards'

interface ShelfItems<T> {
  title: string
  items: readonly T[]
  keyOf: (item: T) => string
  renderItem: (item: T, index: number) => ReactNode
}

const ARROW =
  'press hidden size-tap items-center justify-center rounded-full border border-[var(--color-charcoal-100)] bg-[var(--color-bg)] text-[var(--color-charcoal-900)] md:inline-flex'

export function ShelfRow<T>({
  title,
  items,
  keyOf,
  renderItem,
  onSeeAll,
  limit = 12,
  testId,
}: ShelfItems<T> & { onSeeAll?: () => void; limit?: number; testId?: string }) {
  const listRef = useRef<HTMLUListElement>(null)
  if (items.length === 0) return null
  const scroll = (dir: 1 | -1) => {
    const list = listRef.current
    if (list) list.scrollBy({ left: dir * Math.max(list.clientWidth * 0.9, 200), behavior: 'smooth' })
  }

  return (
    <section data-testid={testId ?? 'shelf-row'} aria-label={title} className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-[var(--color-charcoal-900)]">
          {onSeeAll ? (
            <button type="button" onClick={onSeeAll} className="press inline-flex min-h-tap items-center gap-1 text-left">
              {title}
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          ) : (
            title
          )}
        </h3>
        <div className="flex shrink-0 items-center gap-2">
          {onSeeAll && (
            <button
              type="button"
              onClick={onSeeAll}
              aria-label={`See all ${title}`}
              className="press inline-flex min-h-tap items-center text-sm font-medium text-[var(--color-charcoal-900)] underline underline-offset-4"
            >
              See all
            </button>
          )}
          <button type="button" onClick={() => scroll(-1)} aria-label={`Scroll ${title} left`} className={ARROW}>
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => scroll(1)} aria-label={`Scroll ${title} right`} className={ARROW}>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      <ul
        ref={listRef}
        className="-mx-3 flex flex-nowrap snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-3 px-3 pb-2 [scrollbar-width:none] md:-mx-6 md:scroll-px-6 md:px-6"
      >
        {items.slice(0, limit).map((item, i) => (
          <li key={keyOf(item)} className="w-[min(78vw,18rem)] shrink-0 snap-start">
            {renderItem(item, i)}
          </li>
        ))}
      </ul>
    </section>
  )
}

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'

/** The shelf opened: every item, as its own screen. Back and Escape close it; Tab stays inside; focus returns to the opener. */
export function ShelfScreen<T>({ title, items, keyOf, renderItem, onClose }: ShelfItems<T> & { onClose: () => void }) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    headingRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onCloseRef.current()
      if (e.key !== 'Tab' || !dialogRef.current) return
      const all = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const [first, last] = [all[0], all[all.length - 1]]
      if (!first || !last) return
      if (e.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      opener?.focus?.()
    }
  }, [])

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="shelf-screen" className="fixed inset-0 z-50 overflow-y-auto bg-[var(--color-bg)]">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--color-charcoal-100)] bg-[var(--color-bg)] px-3 md:px-6">
        <button type="button" onClick={onClose} className="press inline-flex min-h-tap items-center gap-1 text-sm font-medium text-[var(--color-charcoal-900)]">
          <ArrowLeft size={18} aria-hidden="true" />
          Back
        </button>
        <h2 id={titleId} ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-[var(--color-charcoal-900)] outline-none">
          {title}
        </h2>
      </div>
      <div className="px-3 py-4 md:px-6">
        <CardGrid>
          {items.map((item, i) => (
            <li key={keyOf(item)}>{renderItem(item, i)}</li>
          ))}
        </CardGrid>
      </div>
    </div>
  )
}
