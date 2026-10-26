/** F118 — this round: the first 3 towns to reach both goals open. */
export function RoundBanner({ left, size }: { left: number; size: number }) {
  return (
    <p className="mt-4 rounded-lg bg-[var(--color-highlight-tint)] px-4 py-3 text-body-sm text-[var(--color-fg)]" data-testid="round-banner">
      {left === 0
        ? `This round’s ${size} towns are set. Keep going: the next round starts from here.`
        : `The first ${size} towns to reach both goals open. ${left} of ${size} places left.`}
    </p>
  )
}
