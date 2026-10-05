// #348 — turning a finished "How do people find you?" answer into what the
// Page saves. Shared by the Edit form and the Page's Where sheet (#302) so the
// two can't drift.

import { pinLabel } from '@/lib/places/pin-label'
import type { createLocationAction, metroAnchorPlaceAction } from '@/app/_actions/location-actions'
import type { EditPageInput } from '@/app/g/[handle]/edit/actions'
import type { PageWhere } from '@/lib/groups/page-where'
import { emptyWhere, type WhereValue } from './WhereFields'

export interface WhereDeps {
  createLocation: typeof createLocationAction
  metroAnchor: typeof metroAnchorPlaceAction
  label?: typeof pinLabel
}

/** Start the question from what's saved. A pin isn't carried over: changing a location means setting it again. */
export function whereValueFrom(saved: PageWhere | null): WhereValue {
  if (!saved) return emptyWhere
  return {
    ...emptyWhere,
    mode: saved.mode,
    visit: { ...emptyWhere.visit, howToFind: saved.howToFind ?? '' },
    travel: { towns: saved.towns },
    roaming: { usuallyAround: saved.usuallyAround ?? '' },
  }
}

export type WherePatch = { ok: true; patch: Partial<EditPageInput> } | { ok: false; message: string }

/** `null` patch fields mean "nothing finished yet": the caller decides whether that's an error. */
export async function wherePatch(where: WhereValue, savedMode: WhereValue['mode'], deps: WhereDeps): Promise<WherePatch | null> {
  // Already "People come to me", pin left as it is: only the note changes.
  if (where.mode === 'visit' && !where.visit.pin && savedMode === 'visit') {
    return { ok: true, patch: { whereMode: 'visit', howToFind: where.visit.howToFind } }
  }
  const visitReady = where.mode === 'visit' && where.visit.pin && (!where.visit.areaOnly || where.visit.area)
  if (!(visitReady || where.mode === 'travel' || where.mode === 'roaming')) return null

  let input: Parameters<WhereDeps['createLocation']>[0]
  if (where.mode === 'visit') {
    const v = where.visit
    const label = v.label ?? (v.areaOnly ? '' : await (deps.label ?? pinLabel)(v.pin![0], v.pin![1]))
    input = v.areaOnly
      ? { label: v.area!.name, neighborhoodId: v.area!.id }
      : { label, address: { geographyWkt: `SRID=4326;POINT(${v.pin![0]} ${v.pin![1]})`, resolvedAddressText: label } }
  } else {
    const anchor = await deps.metroAnchor()
    if (!anchor.ok || !anchor.data) return { ok: false, message: "We couldn't find the Sacramento area just now. Try again?" }
    input = { label: anchor.data.name, neighborhoodId: anchor.data.id }
  }
  const made = await deps.createLocation(input)
  // The action's own message, which is written for the owner.
  if (!made.ok) return { ok: false, message: made.message }
  return {
    ok: true,
    patch: {
      anchorLocationId: made.data.id,
      whereMode: where.mode!,
      howToFind: where.mode === 'visit' ? where.visit.howToFind : null,
      usuallyAround: where.mode === 'roaming' ? where.roaming.usuallyAround : null,
      serviceAreaPlaceIds: where.mode === 'travel' ? where.travel.towns.map((t) => t.id) : [],
    },
  }
}
