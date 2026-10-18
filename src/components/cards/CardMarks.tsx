// #796 (Don, 2026-10-16) — what a card is, at a glance: a megaphone for a post, a page for a Page, with the
// word for a screen reader. A seeder sample (#556) is marked as one wherever it shows: the "Sample" label is
// its accessible label; the diagonal watermark (like a DRAFT stamp) is decoration, hidden from assistive tech.
// #922 (Don, 2026-10-18) — no chip or pill UI anywhere [always]: the label is small-caps text, not a pill.

import { FileText, Megaphone } from 'lucide-react'

export function TypeMark({ type }: { type: 'post' | 'page' }) {
  const Icon = type === 'post' ? Megaphone : FileText
  return (
    <span data-testid="card-type" data-type={type} className="inline-flex shrink-0 items-center text-[var(--color-fg-muted)]">
      <Icon size={14} strokeWidth={1.75} aria-hidden />
      <span className="sr-only">{type === 'post' ? 'Post' : 'Page'}</span>
    </span>
  )
}

export function SampleLabel() {
  return (
    <span data-testid="sample-label" className="shrink-0 whitespace-nowrap text-[11px] font-semibold uppercase leading-4 tracking-wider text-[var(--color-fg)]">
      Sample
    </span>
  )
}

export function SampleWatermark() {
  return (
    <span
      data-testid="sample-watermark"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 top-1/3 z-10 flex select-none items-center justify-center overflow-hidden"
    >
      <span className="-rotate-[30deg] whitespace-nowrap text-5xl font-bold tracking-widest text-[var(--color-fg)] opacity-[0.07]">
        SAMPLE
      </span>
    </span>
  )
}

/** The not-a-real-offer line under a sample post (Don, 2026-10-10: "so nobody shows up for a deal that does not exist"). */
export function SampleNote() {
  return (
    <p data-testid="sample-note" className="text-xs text-[var(--color-fg-muted)]">
      Sample: not a real offer.
    </p>
  )
}
