'use client'

// The parts of an announcement that are not its words: when it is, and where.
//
// F072 criterion 3 — both OPTIONAL, and both are the announcement's own. An
// announcement with no time is a first-class announcement, not a degraded
// event; an announcement with no address reads as being at its Page's
// location, which is where its Page already is.
//
// One component, used by the composer and by an edit, so the two cannot come
// to disagree about what a date means.

import {
  LocationPlaceFields,
  initialLocationPlaceFieldsState,
  type LocationPlaceFieldsState,
} from '@/components/locations/LocationPlaceFields'

export interface AnnouncementWhenWhere {
  /** `yyyy-mm-dd`, as a date input emits it. Empty means undated. */
  date: string
  /** `hh:mm`, as a time input emits it. Empty means undated. */
  time: string
  /** Whether the creator opened the address control at all. Closed is not the
   *  same as cleared: an announcement that was somewhere and is being edited
   *  keeps its place unless the creator says otherwise. */
  addingPlace: boolean
  place: LocationPlaceFieldsState
}

export const emptyWhenWhere: AnnouncementWhenWhere = {
  date: '',
  time: '',
  addingPlace: false,
  place: initialLocationPlaceFieldsState,
}

export function AnnouncementFields({
  value,
  onChange,
  idPrefix,
  placeLabel,
}: {
  value: AnnouncementWhenWhere
  onChange: (next: AnnouncementWhenWhere) => void
  idPrefix: string
  /** Where this announcement is now, if it already has somewhere of its own. */
  placeLabel?: string | null
}) {
  return (
    <div className="flex flex-col gap-3">
      <fieldset className="border-0 p-0">
        <legend className="text-sm font-medium text-[var(--color-fg)]">
          When is it? <span className="font-normal text-[var(--color-fg-muted)]">Optional</span>
        </legend>
        <div className="mt-1 flex flex-wrap gap-2">
          <label className="flex flex-col">
            <span className="sr-only">Date</span>
            <input
              type="date"
              data-testid={`${idPrefix}-date`}
              className="input"
              value={value.date}
              onChange={(e) => onChange({ ...value, date: e.target.value })}
            />
          </label>
          <label className="flex flex-col">
            <span className="sr-only">Time</span>
            <input
              type="time"
              data-testid={`${idPrefix}-time`}
              className="input"
              value={value.time}
              onChange={(e) => onChange({ ...value, time: e.target.value })}
            />
          </label>
          {(value.date || value.time) && (
            <button
              type="button"
              data-testid={`${idPrefix}-clear-when`}
              className="flex min-h-[44px] items-center text-sm text-[var(--color-accent)] underline"
              onClick={() => onChange({ ...value, date: '', time: '' })}
            >
              No particular time
            </button>
          )}
        </div>
      </fieldset>

      <div>
        <span className="text-sm font-medium text-[var(--color-fg)]">
          Where is it? <span className="font-normal text-[var(--color-fg-muted)]">Optional</span>
        </span>
        {!value.addingPlace ? (
          <>
            <p className="mt-1 text-sm text-[var(--color-fg-muted)]" data-testid={`${idPrefix}-place-current`}>
              {placeLabel ?? 'At your Page’s address.'}
            </p>
            <button
              type="button"
              data-testid={`${idPrefix}-add-place`}
              className="mt-1 flex min-h-[44px] items-center text-sm text-[var(--color-accent)] underline"
              onClick={() => onChange({ ...value, addingPlace: true })}
            >
              {placeLabel ? 'Change where' : 'Somewhere else?'}
            </button>
          </>
        ) : (
          <div className="mt-1">
            <LocationPlaceFields
              state={value.place}
              setState={(place) => onChange({ ...value, place })}
              idPrefix={`${idPrefix}-place`}
            />
            <button
              type="button"
              data-testid={`${idPrefix}-drop-place`}
              className="mt-1 flex min-h-[44px] items-center text-sm text-[var(--color-accent)] underline"
              onClick={() =>
                onChange({ ...value, addingPlace: false, place: initialLocationPlaceFieldsState })
              }
            >
              {placeLabel ? 'Leave it where it is' : 'At your Page’s address instead'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
