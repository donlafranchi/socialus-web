// #1141 — forward-button state for the mobile bar. Browsers do not say whether Forward has
// anywhere to go, so the trail counts it from our own Back and Forward taps: Back adds one,
// Forward takes one off, and any other move (a link, a search) starts a new trail.

export type Trail = { forward: number; pending: 'back' | 'forward' | null }

export const emptyTrail: Trail = { forward: 0, pending: null }

export const tapBack = (t: Trail): Trail => ({ ...t, pending: 'back' })
export const tapForward = (t: Trail): Trail => (t.forward > 0 ? { ...t, pending: 'forward' } : t)

/** The browser reported a history move (popstate). */
export function popped(t: Trail): Trail {
  if (t.pending === 'back') return { forward: t.forward + 1, pending: null }
  if (t.pending === 'forward') return { forward: Math.max(0, t.forward - 1), pending: null }
  return t
}

/** The address changed. A move we did not just make through Back or Forward ends the trail. */
export function moved(t: Trail, wasHistoryMove: boolean): Trail {
  return wasHistoryMove ? t : emptyTrail
}
