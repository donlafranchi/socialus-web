// #527 — a Page while the server builds it: the cover, the name and a few lines
// in outline, so a tap on a card is answered at once instead of the card moving
// and nothing else happening.

export function PageSkeleton() {
  return (
    <main className="pb-nav" aria-busy="true">
      <p role="status" className="sr-only">
        Loading this Page
      </p>
      <div className="motion-safe:animate-pulse">
        <div className="aspect-[8/3] w-full bg-[var(--color-surface)]" />
        <div className="gutter py-4">
          <div className="h-6 w-2/3 rounded-sm bg-[var(--color-surface)]" />
          <div className="mt-3 h-4 w-1/3 rounded-sm bg-[var(--color-surface)]" />
          <div className="mt-6 h-4 w-full rounded-sm bg-[var(--color-surface)]" />
          <div className="mt-2 h-4 w-5/6 rounded-sm bg-[var(--color-surface)]" />
          <div className="mt-2 h-4 w-3/4 rounded-sm bg-[var(--color-surface)]" />
        </div>
      </div>
    </main>
  )
}
