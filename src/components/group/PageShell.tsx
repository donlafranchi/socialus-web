// #555 — a Page's shell, drawn at once from what its card already knew: the Page's own name, kind and photo, with the
// rest in outline, while the server builds the Page (#537 streams the rest in behind it). Shown over the card the
// moment it is tapped (see HandoffLink); it is never a route's loading boundary, because a Page that does not exist or
// is a draft must still answer 404, and a boundary would send 200 first.

import type { CardHandoff } from '@/lib/browse/card-handoff'

export function PageShell({ card }: { card: CardHandoff }) {
  return (
    <main className="pb-dock" aria-busy="true">
      <p role="status" className="sr-only">
        Loading this Page
      </p>
      <div className="motion-safe:animate-pulse">
        <div className="relative aspect-[8/3] w-full overflow-hidden bg-[var(--color-surface)]">
          {/* The same address the card already loaded, so the browser has it. */}
          {card.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.imageUrl} alt="" className="h-full w-full object-cover" />
          )}
        </div>
      </div>
      <div className="gutter py-4">
        <h1 className="text-title-1 text-[var(--color-fg)]">{card.name}</h1>
        {card.kindLine && <p className="mt-1 text-body-sm text-[var(--color-fg-muted)]">{card.kindLine}</p>}
        <div className="motion-safe:animate-pulse">
          <div className="mt-6 h-4 w-full rounded-sm bg-[var(--color-surface)]" />
          <div className="mt-2 h-4 w-5/6 rounded-sm bg-[var(--color-surface)]" />
          <div className="mt-2 h-4 w-3/4 rounded-sm bg-[var(--color-surface)]" />
        </div>
      </div>
    </main>
  )
}
