import { stillToGo } from '@/lib/open/towns'

const n = (x: number) => x.toLocaleString('en-US')

/** One goal as a bar: how many of how many, and how many still to go. */
export function GoalBar({ label, have, goal, compact = false }: { label: string; have: number; goal: number; compact?: boolean }) {
  const left = stillToGo(have, goal)
  return (
    <div data-testid={`goal-${label.toLowerCase()}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={compact ? 'text-body-sm text-[var(--color-fg)]' : 'text-body font-semibold text-[var(--color-fg)]'}>
          {n(have)} of {n(goal)} {label.toLowerCase()}
        </span>
        <span className="text-body-sm text-[var(--color-fg-muted)]">{left === 0 ? 'Goal reached' : `${n(left)} to go`}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-valuenow={Math.min(have, goal)}
        className={`mt-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)] ${compact ? 'h-1.5' : 'h-2.5'}`}
      >
        <div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${Math.min(100, (have / goal) * 100)}%` }} />
      </div>
    </div>
  )
}
