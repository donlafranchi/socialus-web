// The badge, from the recovered `OwnershipBadge` (ccbf54d).
//
// A 12px dot and a full sentence. Never an icon, never a coloured pill with the
// text inside it — that is what makes it read as a fact ABOUT the thing rather
// than a label stuck ON it. Renamed from OwnershipBadge because ownership tier
// was a vendor concept and is retired; the shape outlives it.
//
// The colour carries no meaning on its own and is never the only signal — the
// sentence always says it too, which is also what makes it legible to someone
// who cannot tell the dots apart.

export function StatusDot({
  color,
  label,
  className = '',
}: {
  color: string
  label: string
  className?: string
}) {
  return (
    <div data-testid="status-dot" className={`flex items-center gap-2 ${className}`.trim()}>
      <span
        data-testid="status-dot-swatch"
        aria-hidden
        className="inline-block w-3 h-3 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      <span data-testid="status-dot-label" className="text-sm font-medium">
        {label}
      </span>
    </div>
  )
}
