import type { Audience } from './registry'

export type Viewer = { builder: boolean; operator: boolean }

/** No row means builders only, so new work starts dark. Anything unrecognised is off. */
export function resolveFlag(audience: string | null | undefined, viewer: Viewer): boolean {
  const a = (audience ?? 'builders') as Audience
  if (a === 'everyone') return true
  if (a === 'builders') return viewer.builder || viewer.operator
  return false
}
