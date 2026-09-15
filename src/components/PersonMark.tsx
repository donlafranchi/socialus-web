// F086 (thin front) — what a person shows when they have no photo.
//
// `members.avatar_url` exists, has no write path anywhere in the app, and
// nobody has one. So this is not a fallback for an edge case; it is what
// every person renders today, and it should look deliberate rather than like
// a missing image.
//
// design-language.md rules the shape:
//   "A Page's default art (no photo) is deterministic — the same Page renders
//    the same mark on every load, to every viewer ... never a colour, never an
//    emoji, never a per-kind palette. No stock photography, ever."
//
// So: the person's initial, on one of a small fixed set of neutral tones
// chosen by a stable hash of their name. Same name, same mark, always.
//
// It takes a photoUrl it can already render, so the day an upload path exists
// nothing here changes.

/** A small, fixed set. Not a ramp, and not per-kind. */
const TONES = ['a', 'b', 'c', 'd'] as const

const TONE_CLASS: Record<(typeof TONES)[number], string> = {
  a: 'bg-[var(--color-charcoal-100)] text-[var(--color-charcoal-900)]',
  b: 'bg-neutral-200 text-[var(--color-charcoal-900)]',
  c: 'bg-[var(--color-charcoal-700)] text-white',
  d: 'bg-neutral-700 text-white',
}

/** The letter shown when there is no photo. `·` rather than a blank square. */
export function initialFor(name: string): string {
  const first = name.trim().charAt(0)
  return first ? first.toUpperCase() : '·'
}

/** Stable across loads, processes and people — a plain string hash, not random. */
function toneFor(name: string): (typeof TONES)[number] {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return TONES[h % TONES.length]
}

interface Props {
  name: string
  photoUrl?: string | null
  /** Tailwind size classes. Defaults to the nav size. */
  className?: string
}

export function PersonMark({ name, photoUrl, className = 'h-8 w-8' }: Props) {
  if (photoUrl) {
    return (
      // Decorative: the adjacent name labels it, so announcing it twice is
      // worse than not announcing it.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        data-testid="person-mark-photo"
        src={photoUrl}
        alt=""
        className={`${className} shrink-0 rounded-full object-cover`}
      />
    )
  }

  const tone = toneFor(name)
  return (
    <span
      data-testid="person-mark"
      data-tone={tone}
      aria-hidden="true"
      className={`${className} inline-flex shrink-0 items-center justify-center rounded-full text-sm font-semibold ${TONE_CLASS[tone]}`}
    >
      {initialFor(name)}
    </span>
  )
}
