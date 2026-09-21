// What the location pill says.
//
// It used to print the resolved place's display name unconditionally. When
// nothing was chosen that name is **"The Good Place"** — the seeded launch
// locality standing in for the IP geolocation deferred at b1 — so the pill
// asserted a locality that does not exist to a person who never named one.
// That is what Don saw as "I have the good place and can't change it".
//
// The rule: say what is true. If someone chose a place, name it. If nobody did,
// say nobody did, in words a member would use.

/**
 * What the pill needs to know, and nothing else.
 *
 * It used to be `Pick<ExploreOrigin, …>`. `origin.ts` went with the distance
 * filter (T156), and the pill never needed the rest of it.
 */
export interface PillPlace {
  placeName: string | null
  /** Did a person actually pick this place? */
  chosen: boolean
}

/** Shown when no place has been chosen. Plain words, no invented locality. */
export const NO_PLACE_CHOSEN_LABEL = 'Choose your area'

export function placePillLabel(origin: PillPlace | null): string {
  if (!origin || !origin.chosen) return NO_PLACE_CHOSEN_LABEL
  const name = origin.placeName?.trim()
  return name ? name : NO_PLACE_CHOSEN_LABEL
}

/**
 * Does the pill read as a prompt rather than a statement?
 *
 * The caller styles it differently — an unanswered question should not look
 * like a settled fact.
 */
export function isPlacePrompt(origin: PillPlace | null): boolean {
  return placePillLabel(origin) === NO_PLACE_CHOSEN_LABEL
}
