// T163 (#77) — where a metro stands, and what the popup is allowed to say.
//
// Pure, and deliberately separate from the handler: the eligibility rule and
// the copy constraint are the two things in F076 that are easy to get subtly
// wrong and easy to test exhaustively, so they live where a test can reach
// them without a database.
//
// THE SPLIT IS HOW THE PLATFORM DECIDES; 300 IS WHAT THE PERSON READS.
// A combined-only gate can be satisfied by 295 patrons and 5 creators, which
// opens a metro with nothing in it — Browse is complete and shows what is
// actually there, and with five creators that is five Pages. Creators are what
// make Browse non-empty, so creators are the real gate. Patrons are the reason
// opening is worth doing; creators are the reason it is possible.

/** What the member sees measured against. Never the per-role thresholds. */
export const COMBINED_TARGET = 300

export interface MetroCounts {
  creatorCount: number
  patronCount: number
  /** Per-metro configuration, not constants — F076 criterion 11. */
  creatorThreshold: number
  patronThreshold: number
}

export interface MetroStanding extends MetroCounts {
  combined: number
  target: number
  /**
   * Eligible to open — which is NOT open. Crossing the threshold is a fact
   * about a metro; opening it is an act by a person (criterion 12).
   */
  eligible: boolean
  /** Exactly what the popup may render: one number against one target. */
  display: { combined: number; target: number }
}

export function metroStanding(counts: MetroCounts): MetroStanding {
  const combined = counts.creatorCount + counts.patronCount
  return {
    ...counts,
    combined,
    target: COMBINED_TARGET,
    // Both halves, and the creator half is the one that bites.
    eligible:
      counts.creatorCount >= counts.creatorThreshold &&
      counts.patronCount >= counts.patronThreshold,
    display: { combined, target: COMBINED_TARGET },
  }
}

/**
 * What is still needed — never when it will arrive.
 *
 * Criterion 9 is a hard constraint rather than copy guidance, so the wording
 * here is load-bearing and the test scans every state this function can
 * produce. No date, no timeline, no "soon", and no promise that the metro will
 * open at all. It also does not leak the creator/patron split, which is what
 * keeps a popup a popup.
 */
export function standingMessage(standing: Pick<MetroStanding, 'combined' | 'target'>): string {
  const remaining = Math.max(0, standing.target - standing.combined)
  if (remaining > 0) {
    const people = remaining === 1 ? 'one more person' : `${remaining} more people`
    return `This metro needs ${people} before there is enough here to be worth showing you.`
  }
  // Thresholds met, or the combined target met while the creator half is not.
  // Either way the honest sentence is the same: enough people are here, and a
  // person decides what happens next. Saying more would be a promise.
  return 'Enough people are here. A person reviews each metro before it goes live.'
}

/**
 * What someone who left an address reads. Fixed text, and fixed is the point.
 *
 * RULED 2026-09-22 (#196): an anonymous submitter is shown no count. Any
 * truthful live count leaks membership by differencing — the leak is in the
 * number, not in when it is read — so there is no number here, and nothing in
 * this string is derived from one. `standingMessage` above interpolates a
 * remaining count and must never be used on the anonymous path; this constant
 * exists so that is a different function rather than a forgotten argument.
 *
 * It still states what is needed (criterion 9), still promises no date and no
 * opening, and names the single use the address has (criterion 15).
 */
/**
 * What a person who left an address reads, in one number and one line.
 *
 * RULED 2026-09-23, reversing 2026-09-22. The count is back: the leak was never
 * the number existing, it was the number being recomputed in response to your
 * own write. It now comes from `getMetroWaitingCounts`, which every surface
 * shares and which a submission does not move.
 *
 * `standingMessage` is the same copy a signed-in member gets, deliberately —
 * two people looking at the same metro should read the same sentence, and the
 * count behind it is the same cached figure either way.
 *
 * Criterion 15 — the one use the address has — is said BEFORE the person
 * types, on the panel itself, rather than in the confirmation. It is a reason
 * to submit, not a footnote after the fact.
 */
export function standingFromCombined(combined: number): { combined: number; target: number } {
  return { combined, target: COMBINED_TARGET }
}
