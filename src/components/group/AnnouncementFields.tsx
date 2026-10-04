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

// F074 — RECURRENCE DOES NOT COVER YEARLY, AND SOMEONE WILL ASSUME IT DOES.
//
// Recorded here because this is the file recurrence work touches first.
//
// The approved F074 is weekly-on-chosen-days with an optional start and end
// date. It has no yearly case. On 2026-09-23 Don named a YEARLY event as the
// reason past announcements must survive — "Especially if the announcement is
// for a yearly event" — so the case is live in his head and absent from the
// scenario.
//
// This is a note, not a deferral and not a licence to add it: building yearly
// off the back of this comment would be answering a scenario question by
// implementation. It is here so that whoever builds recurrence checks whether
// F074 was amended rather than assuming the gap was considered.

import { useState } from 'react'
import { DateField, TimeField } from '@/components/ui/DateTimeFields'
import { metroDate } from '@/lib/metro/metro-week'
import { METRO_TIME_ZONE } from '@/lib/metro/metro-time'
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
  /** #262 — `hh:mm` the same day, optional. Empty means no end. */
  endTime: string
  /** Whether the creator opened the address control at all. Closed is not the
   *  same as cleared: an announcement that was somewhere and is being edited
   *  keeps its place unless the creator says otherwise. */
  addingPlace: boolean
  place: LocationPlaceFieldsState
}

export const emptyWhenWhere: AnnouncementWhenWhere = {
  date: '',
  time: '',
  endTime: '',
  addingPlace: false,
  place: initialLocationPlaceFieldsState,
}

export function AnnouncementFields({
  value,
  onChange,
  idPrefix,
  placeLabel,
  now = new Date(),
}: {
  value: AnnouncementWhenWhere
  onChange: (next: AnnouncementWhenWhere) => void
  idPrefix: string
  /** Where this announcement is now, if it already has somewhere of its own. */
  placeLabel?: string | null
  /** For tests; the defaults are read from the metro's clock. */
  now?: Date
}) {
  const [endTouched, setEndTouched] = useState(Boolean(value.endTime))
  return (
    <div className="flex flex-col gap-3">
      {/* #317 — the phone's own pickers, labelled and full size. Still
          optional: undated is a first-class post. Asking for a time fills
          today, the next whole hour, and an end an hour later that follows
          the start until the owner sets it. */}
      <fieldset className="border-0 p-0">
        <legend className="text-body-sm font-medium text-[var(--color-fg)]">
          When is it? <span className="font-normal text-[var(--color-fg-muted)]">Optional</span>
        </legend>
        {!(value.date || value.time || value.endTime) ? (
          <button
            type="button"
            data-testid={`${idPrefix}-add-when`}
            className="mt-1 flex min-h-tap items-center text-body-sm font-medium text-[var(--color-charcoal-900)] underline"
            onClick={() => {
              const d = whenDefaults(now)
              setEndTouched(false)
              onChange({ ...value, ...d })
            }}
          >
            Add a date and time
          </button>
        ) : (
          <>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <DateField
                label="Date"
                testId={`${idPrefix}-date`}
                min={metroDate(now, METRO_TIME_ZONE)}
                value={value.date}
                onChange={(date) => onChange({ ...value, date })}
              />
              <TimeField
                label="Starts"
                testId={`${idPrefix}-time`}
                value={value.time}
                onChange={(time) =>
                  onChange({ ...value, time, ...(endTouched || !time ? {} : { endTime: plusOneHour(time) }) })
                }
              />
              <TimeField
                label="Ends"
                testId={`${idPrefix}-end-time`}
                value={value.endTime}
                onChange={(endTime) => {
                  setEndTouched(true)
                  onChange({ ...value, endTime })
                }}
              />
            </div>
            <button
              type="button"
              data-testid={`${idPrefix}-clear-when`}
              className="mt-1 flex min-h-tap items-center text-body-sm text-[var(--color-fg-muted)] underline"
              onClick={() => onChange({ ...value, date: '', time: '', endTime: '' })}
            >
              No particular time
            </button>
          </>
        )}
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

/** "18:30" → "19:30", stopping at the end of the day. */
function plusOneHour(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  return h >= 23 ? '23:59' : `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Today in the metro, the next whole hour, and an hour after it. */
function whenDefaults(now: Date): { date: string; time: string; endTime: string } {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: METRO_TIME_ZONE }).format(now),
  )
  const start = `${String(Math.min(hour + 1, 23)).padStart(2, '0')}:00`
  return { date: metroDate(now, METRO_TIME_ZONE), time: start, endTime: plusOneHour(start) }
}
