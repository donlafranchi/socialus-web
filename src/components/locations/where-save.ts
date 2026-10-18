// #348 — turning a finished "How do people find you?" answer into what the
// Page saves. Shared by the Edit form and the Page's Where sheet (#302) so the
// two can't drift.

import { pinLabel } from '@/lib/places/pin-label'
import type { createLocationAction, metroAnchorPlaceAction } from '@/app/_actions/location-actions'
import type { EditPageInput } from '@/app/g/[handle]/edit/actions'
import { fixedPlacement, type PageWhere } from '@/lib/groups/page-where'
import type { Placement } from '@/lib/groups/resolve-page-placement'
import { emptyWhere, type WhereValue } from './where-value'

export interface WhereDeps {
  createLocation: typeof createLocationAction
  metroAnchor: typeof metroAnchorPlaceAction
  label?: typeof pinLabel
  /** #896 — a landmark whose words changed keeps the pin it was saved with. */
  savedPin?: [number, number] | null
}

/** Start the question from what's saved. The pin isn't in the value (the map opens on it, #455); an unmoved pin saves only the note. */
export function whereValueFrom(saved: PageWhere | null, placement?: Pick<Placement, 'kind' | 'label' | 'lng' | 'lat'> | null): WhereValue {
  if (!saved) return emptyWhere
  placement = fixedPlacement(saved, placement ?? undefined)
  const area = saved.mode === 'visit' && placement?.kind === 'area'
  const stops = saved.stops ?? []
  return {
    ...emptyWhere,
    mode: saved.mode,
    visit: {
      ...emptyWhere.visit,
      howToFind: saved.howToFind ?? '',
      areaOnly: area,
      area: area ? { id: '', name: placement!.label } : null,
    },
    travel: { towns: saved.towns },
    // #896 — the other answers' own fields.
    landmark: { text: saved.mode === 'landmark' ? (placement?.label ?? '') : '' },
    multi: { addresses: saved.mode === 'multi' && stops.length > 0 ? stops.map((s) => s.label) : emptyWhere.multi.addresses },
    roaming: { usuallyAround: saved.usuallyAround ?? '', stops: saved.mode === 'roaming' ? stops.map((s) => ({ where: s.label, when: s.whenText ?? '' })) : [] },
    online: { note: saved.mode === 'online' ? (saved.howToFind ?? '') : '' },
  }
}

/** #455 — the saved front-door pin the Location sheet opens on, or null for none. */
export const savedPinFrom = (placement?: Pick<Placement, 'lng' | 'lat'> | null): [number, number] | null =>
  placement ? [placement.lng, placement.lat] : null

export type WherePatch = { ok: true; patch: Partial<EditPageInput> } | { ok: false; message: string }

const pointAt = (pin: [number, number]) => `SRID=4326;POINT(${pin[0]} ${pin[1]})`
const METRO_DOWN = "We couldn't find the Sacramento area just now. Try again?"

/** `null` patch fields mean "nothing finished yet": the caller decides whether that's an error. */
export async function wherePatch(where: WhereValue, savedMode: WhereValue['mode'], deps: WhereDeps): Promise<WherePatch | null> {
  // Already "People come to me", pin left as it is: only the note changes.
  if (where.mode === 'visit' && !where.visit.pin && savedMode === 'visit') {
    return { ok: true, patch: { whereMode: 'visit', howToFind: where.visit.howToFind } }
  }
  const mode = where.mode
  if (!mode) return null
  let input: Parameters<WhereDeps['createLocation']>[0]
  let stops: { label: string; whenText: string | null }[] = []

  if (mode === 'visit') {
    const v = where.visit
    if (!v.pin || (v.areaOnly && !v.area)) return null
    const label = v.label ?? (v.areaOnly ? '' : await (deps.label ?? pinLabel)(v.pin[0], v.pin[1]))
    input = v.areaOnly ? { label: v.area!.name, neighborhoodId: v.area!.id } : { label, address: { geographyWkt: pointAt(v.pin), resolvedAddressText: label } }
  } else if (mode === 'landmark') {
    // #896 — the owner's own words at the pin they put down.
    const text = where.landmark.text.trim()
    if (!text) return { ok: false, message: 'Add the cross streets or a landmark.' }
    const pin = where.visit.pin ?? (savedMode === 'landmark' ? deps.savedPin : null)
    if (!pin) return null
    input = { label: text, address: { geographyWkt: pointAt(pin), resolvedAddressText: text } }
  } else {
    if (mode === 'multi') {
      stops = where.multi.addresses.map((a) => a.trim()).filter(Boolean).map((label) => ({ label, whenText: null }))
      if (stops.length === 0) return { ok: false, message: 'Add at least one address.' }
    }
    if (mode === 'roaming') {
      stops = where.roaming.stops.filter((s) => s.where.trim()).map((s) => ({ label: s.where.trim(), whenText: s.when.trim() || null }))
    }
    // No single fixed place: anchored to the metro only so the Page scopes to its market (#894).
    const anchor = await deps.metroAnchor()
    if (!anchor.ok || !anchor.data) return { ok: false, message: METRO_DOWN }
    input = { label: anchor.data.name, neighborhoodId: anchor.data.id }
  }
  const made = await deps.createLocation(input)
  // The action's own message, which is written for the owner.
  if (!made.ok) return { ok: false, message: made.message }
  return {
    ok: true,
    patch: {
      anchorLocationId: made.data.id,
      whereMode: mode,
      howToFind: mode === 'visit' || mode === 'landmark' ? where.visit.howToFind : mode === 'online' ? where.online.note : null,
      usuallyAround: mode === 'roaming' ? where.roaming.usuallyAround : null,
      serviceAreaPlaceIds: mode === 'travel' ? where.travel.towns.map((t) => t.id) : [],
      stops,
    },
  }
}
