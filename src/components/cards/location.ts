// Where a card's thing is. Required, always present, never an empty state.
//
// THE VOCABULARY IS NOT INVENTED HERE. Every term below is already ratified in
// ops-pattern and is used verbatim:
//
//   · `surfaces.md` § Distance is out (2026-09-03) — "Ordering is hood → metro
//     → wider → online." That line is the scale.
//   · `surfaces.md` § Online is a first-class location option (2026-09-03) —
//     "online Items never render on the map", and the composer must warn that
//     online ranks last.
//   · `item.md` — "an Item's own location (address, neighbourhood, or Online)".
//   · `nouns.md` (2026-09-09) — "a street address if it has a specific
//     location, a neighbourhood otherwise".
//   · `nouns.md` — Place is "platform-curated geography (neighbourhood →
//     state)", which is where `wider` sits.
//
// The ratified word for the no-physical-place case is **Online**, not "World
// Wide Web". Using the term the docs already ratified rather than a second one
// for the same thing.

export const LOCATION_SCALES = ['address', 'neighbourhood', 'metro', 'wider', 'online'] as const

export type LocationScale = (typeof LOCATION_SCALES)[number]

export interface CardLocation {
  scale: LocationScale
  /** What to show. For `online` this may be omitted — the scale supplies it. */
  label?: string | null
}

/** The fallback wording for a scale with no label of its own. */
const DEFAULT_LABEL: Record<LocationScale, string> = {
  address: 'Address on the Page',
  neighbourhood: 'Nearby',
  metro: 'Across the metro',
  wider: 'Further out',
  online: 'Online',
}

/**
 * One line, always non-empty.
 *
 * `online` is a value, not an absence — that is the whole point of the scale
 * being required. A card for something with no physical place says "Online"
 * rather than leaving a gap where every other card has a line.
 */
export function locationLine(location: CardLocation): string {
  const label = location.label?.trim()
  if (label) return label
  return DEFAULT_LABEL[location.scale]
}

/**
 * Does a card of this location belong on a map?
 *
 * `surfaces.md`: "online Items never render on the map — no pin, no fallback
 * coordinate." Exported so the map reads the same rule this does rather than
 * re-deciding it.
 */
export function isMappable(location: CardLocation): boolean {
  return location.scale !== 'online'
}
