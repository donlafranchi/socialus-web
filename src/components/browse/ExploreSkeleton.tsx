// #299 — Explore while it loads (L01): the search row and a few cards in
// outline, so the page doesn't jump when the results arrive.

export function ExploreSkeleton() {
  return (
    <main className="pb-nav" aria-busy="true">
      <p role="status" className="sr-only">
        Loading Explore
      </p>
      <div className="border-b border-[var(--color-charcoal-100)] gutter py-2">
        <div className="h-tap w-48 rounded-full bg-[var(--color-surface)]" />
      </div>
      <div className="grid grid-cols-1 gap-4 gutter py-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} data-testid="skeleton-card" className="motion-safe:animate-pulse">
            <div className="aspect-[3/2] w-full rounded-md bg-[var(--color-surface)]" />
            <div className="mt-3 h-4 w-3/4 rounded-sm bg-[var(--color-surface)]" />
            <div className="mt-2 h-4 w-1/2 rounded-sm bg-[var(--color-surface)]" />
          </div>
        ))}
      </div>
    </main>
  )
}
