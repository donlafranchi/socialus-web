'use client'

// #348 — where a Page is (Don, 2026-10-04, "the most elegant"): one question,
// then only the chosen answer's own fields. Google Business Profile's two
// questions folded into one; Airbnb's confirm-the-pin and approximate location;
// Google Maps' drop a pin; Meetup's "how to find us".
// #896 — seven answers (Don, 2026-10-18: "We need more options for when there
// isn't a street address"): Google's service-area and hide-address, a landmark,
// more than one location, a market stall's where and when, online. A plain
// radio list (Don, 2026-10-18: no chips or pills).

import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { geocode, type GeocodingResult } from '@/lib/geocoding'
import { placeForPointAction, searchNeighborhoodsAction, searchPlacesAction } from '@/app/_actions/location-actions'
import type { NeighborhoodMatch } from '@/lib/places/neighborhood-search'
import { Typeahead } from './Typeahead'
import { mapAvailable } from '@/lib/map-config'
import dynamic from 'next/dynamic'

// #527 — the map library is ~480 KB; a visitor opening a Page never edits a pin.
const PinAdjustMap = dynamic(() => import('./PinAdjustMap').then((m) => m.PinAdjustMap), { ssr: false })
const AreaPickMap = dynamic(() => import('./AreaPickMap').then((m) => m.AreaPickMap), { ssr: false })

import { emptyWhere, type Place, type ScheduleStop, type WhereMode, type WhereValue } from './where-value'
export { emptyWhere, type ScheduleStop, type WhereMode, type WhereValue }

/** The answer a radio stands for: a street address and a neighbourhood are both "visit". */
type Answer = 'address' | 'area' | Exclude<WhereMode, 'visit'>
const answerOf = (v: WhereValue): Answer | null => (v.mode === 'visit' ? (v.visit.areaOnly ? 'area' : 'address') : v.mode)
const MAX_STOPS = 20

const SACRAMENTO: [number, number] = [-121.4944, 38.5816]

const ANSWERS: { answer: Answer; title: string; body: string }[] = [
  { answer: 'address', title: 'Street address', body: 'A shop, a studio, an office: people come to the door.' },
  { answer: 'area', title: 'Neighbourhood only', body: 'People come to you, but visitors see only the neighbourhood.' },
  { answer: 'landmark', title: 'Cross streets or a landmark', body: 'A corner, a trailhead, a spot in the park.' },
  { answer: 'multi', title: 'More than one location', body: 'Each with its own address.' },
  { answer: 'roaming', title: 'It moves', body: 'Markets, pop-ups, a truck. Add where and when, if you like.' },
  { answer: 'travel', title: 'I go to them', body: 'You work at their place, anywhere in the towns you choose.' },
  { answer: 'online', title: 'Online only, or by appointment', body: 'No place to visit, so no map.' },
]

export function WhereFields({
  value,
  onChange,
  savedPin = null,
}: {
  value: WhereValue
  onChange: (v: WhereValue) => void
  /** #455 — where the Page's pin is saved, so the map opens there. Not part of the value: an unmoved pin isn't a change. */
  savedPin?: [number, number] | null
}) {
  const set = (patch: Partial<WhereValue>) => onChange({ ...value, ...patch })
  const chosen = answerOf(value)
  const choose = (a: Answer) =>
    a === 'address' || a === 'area' ? set({ mode: 'visit', visit: { ...value.visit, areaOnly: a === 'area' } }) : set({ mode: a })
  return (
    <fieldset className="flex flex-col gap-3" aria-label="How do people find you?">
      <legend className="text-sm font-medium text-[var(--color-fg)]">How do people find you?</legend>
      <div className="flex flex-col">
        {ANSWERS.map((a) => (
          <label key={a.answer} className="flex min-h-tap cursor-pointer gap-3 py-2">
            <input
              type="radio"
              name="where-mode"
              className="mt-1 h-4 w-4 shrink-0"
              checked={chosen === a.answer}
              onChange={() => choose(a.answer)}
              aria-labelledby={`where-${a.answer}-title`}
              aria-describedby={`where-${a.answer}-body`}
            />
            <span>
              <span id={`where-${a.answer}-title`} className={`block text-body-sm text-[var(--color-fg)] ${chosen === a.answer ? 'font-semibold' : 'font-medium'}`}>
                {a.title}
              </span>
              <span id={`where-${a.answer}-body`} className="block text-caption text-[var(--color-fg-muted)]">
                {a.body}
              </span>
            </span>
          </label>
        ))}
      </div>
      {(chosen === 'address' || chosen === 'area') && (
        <Visit variant={chosen} value={value.visit} savedPin={savedPin} onChange={(visit) => set({ visit })} />
      )}
      {chosen === 'landmark' && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-[var(--color-fg)]">Cross streets or landmark</span>
            <input
              className="input"
              maxLength={120}
              placeholder="J St & 20th St, by the fountain"
              value={value.landmark.text}
              onChange={(e) => set({ landmark: { text: e.target.value } })}
            />
          </label>
          <Visit variant="landmark" value={value.visit} savedPin={savedPin} onChange={(visit) => set({ visit })} />
        </>
      )}
      {chosen === 'multi' && <Multi value={value.multi} onChange={(multi) => set({ multi })} />}
      {chosen === 'travel' && <Travel value={value.travel} onChange={(travel) => set({ travel })} />}
      {chosen === 'roaming' && <Roaming value={value.roaming} onChange={(roaming) => set({ roaming })} />}
      {chosen === 'online' && (
        <label className="flex flex-col gap-1">
          <span className="text-sm text-[var(--color-fg)]">Anything to add <span className="text-[var(--color-fg-muted)]">(optional)</span></span>
          <input
            className="input"
            maxLength={140}
            placeholder="By appointment in Midtown"
            value={value.online.note}
            onChange={(e) => set({ online: { note: e.target.value } })}
          />
          <span className="text-caption text-[var(--color-fg-muted)]">Visitors see this instead of a map.</span>
        </label>
      )}
    </fieldset>
  )
}

const ROW_BUTTON = 'press inline-flex min-h-tap items-center gap-2 self-start text-sm font-medium text-[var(--color-accent)] underline'

function Multi({ value, onChange }: { value: WhereValue['multi']; onChange: (v: WhereValue['multi']) => void }) {
  const put = (i: number, text: string) => onChange({ addresses: value.addresses.map((a, j) => (j === i ? text : a)) })
  return (
    <div className="flex flex-col gap-2">
      {value.addresses.map((a, i) => (
        <div key={i} className="flex items-end gap-1">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm text-[var(--color-fg)]">Address {i + 1}</span>
            <input className="input" maxLength={120} autoComplete="off" placeholder="915 I St, Sacramento" value={a} onChange={(e) => put(i, e.target.value)} />
          </label>
          {value.addresses.length > 1 && (
            <button
              type="button"
              aria-label={`Remove address ${i + 1}`}
              onClick={() => onChange({ addresses: value.addresses.filter((_, j) => j !== i) })}
              className="inline-flex size-tap shrink-0 items-center justify-center text-[var(--color-fg-muted)]"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
      {value.addresses.length < MAX_STOPS && (
        <button type="button" onClick={() => onChange({ addresses: [...value.addresses, ''] })} className={ROW_BUTTON}>
          <Plus size={16} aria-hidden="true" />
          Add another location
        </button>
      )}
    </div>
  )
}

function Roaming({ value, onChange }: { value: WhereValue['roaming']; onChange: (v: WhereValue['roaming']) => void }) {
  const put = (i: number, patch: Partial<ScheduleStop>) => onChange({ ...value, stops: value.stops.map((s, j) => (j === i ? { ...s, ...patch } : s)) })
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-[var(--color-fg)]">Usually around <span className="text-[var(--color-fg-muted)]">(optional)</span></span>
        <input
          className="input"
          maxLength={80}
          placeholder="Midtown farmers markets"
          value={value.usuallyAround}
          onChange={(e) => onChange({ ...value, usuallyAround: e.target.value })}
        />
        <span className="text-caption text-[var(--color-fg-muted)]">You show up anywhere in the Sacramento area.</span>
      </label>
      <div role="group" aria-labelledby="where-when-title" className="flex flex-col gap-2">
        <span id="where-when-title" className="text-sm text-[var(--color-fg)]">Where and when <span className="text-[var(--color-fg-muted)]">(optional)</span></span>
        {value.stops.map((s, i) => (
          <div key={i} className="flex flex-col gap-1 border-b border-[var(--color-border)] pb-2">
            <label className="flex flex-col gap-1">
              <span className="text-caption text-[var(--color-fg-muted)]">Where</span>
              <input className="input" maxLength={120} placeholder="Midtown Farmers Market" value={s.where} onChange={(e) => put(i, { where: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-caption text-[var(--color-fg-muted)]">When</span>
              <input className="input" maxLength={80} placeholder="Saturdays, 8am–1pm" value={s.when} onChange={(e) => put(i, { when: e.target.value })} />
            </label>
            <button type="button" onClick={() => onChange({ ...value, stops: value.stops.filter((_, j) => j !== i) })} className={ROW_BUTTON}>
              Remove this stop
            </button>
          </div>
        ))}
        {value.stops.length < MAX_STOPS && (
          <button type="button" onClick={() => onChange({ ...value, stops: [...value.stops, { where: '', when: '' }] })} className={ROW_BUTTON}>
            <Plus size={16} aria-hidden="true" />
            Add a stop
          </button>
        )}
      </div>
    </div>
  )
}

function Visit({
  variant,
  value,
  savedPin,
  onChange,
}: {
  /** #896 — a street address, the neighbourhood only, or the pin under a landmark. */
  variant: 'address' | 'area' | 'landmark'
  value: WhereValue['visit']
  savedPin: [number, number] | null
  onChange: (v: WhereValue['visit']) => void
}) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<GeocodingResult[] | null>(null)
  const [finding, setFinding] = useState(false)
  // Choosing an address clears the neighbourhood field and the other way round.
  const [picks, setPicks] = useState({ address: 0, area: 0 })
  const set = (patch: Partial<WhereValue['visit']>) => onChange({ ...value, ...patch })

  // The neighbourhood follows the pin, except right after one was picked by name (#440).
  const pinKey = value.pin?.join(',')
  const [pickedAt, setPickedAt] = useState<string | null>(null)
  useEffect(() => {
    if (!value.pin || !value.areaOnly || pinKey === pickedAt) return
    let live = true
    placeForPointAction(value.pin[0], value.pin[1]).then((res) => {
      if (live && res.ok) onChange({ ...value, area: res.data })
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinKey, value.areaOnly])

  const find = async () => {
    if (!query.trim()) return
    setFinding(true)
    setMatches(await geocode(query).catch(() => []))
    setFinding(false)
  }

  const notFound = (
    <>We couldn&rsquo;t find that address. Try the full street address{mapAvailable() ? ', or drop a pin on the map' : ''}.</>
  )
  const shownPin = value.pin ?? savedPin
  const dropPin = mapAvailable() && !shownPin && (
    <button
      type="button"
      onClick={() => set({ pin: value.pin ?? SACRAMENTO, label: null })}
      className="min-h-tap self-start text-sm font-medium text-[var(--color-accent)] underline"
    >
      Drop a pin on the map instead
    </button>
  )

  return (
    <div className="flex flex-col gap-3">
      {/* #896 — neighbourhood only: picked by name, or worked out from a dropped pin. */}
      {variant === 'area' && (
        <Typeahead<NeighborhoodMatch>
          key={`area-${picks.address}`}
          label="Neighbourhood"
          placeholder="Curtis Park, Midtown…"
          minChars={2}
          search={async (q) => {
            const res = await searchNeighborhoodsAction(q)
            return res.ok ? res.data : []
          }}
          optionKey={(n) => n.placeId}
          optionLabel={(n) => n.name}
          onPick={(n) => {
            setPicks((p) => ({ ...p, area: p.area + 1 }))
            setPickedAt(n.centroid.join(','))
            // #440 — a neighbourhood picked is a neighbourhood shown, never a street address.
            set({ pin: n.centroid, label: null, area: { id: n.placeId, name: n.name }, areaOnly: true })
          }}
        />
      )}
      {/* #413 — with a map, the address suggests as you type; without one, the lookup runs on request. */}
      {variant === 'area' ? dropPin : mapAvailable() ? (
        <>
          <Typeahead<GeocodingResult>
            key={`address-${picks.area}`}
            label={variant === 'landmark' ? 'Nearby address (optional)' : 'Address'}
            placeholder="915 I St, Sacramento"
            autoComplete="street-address"
            minChars={3}
            search={geocode}
            optionKey={(m) => m.name}
            optionLabel={(m) => m.name}
            onPick={(m) => {
              setPicks((p) => ({ ...p, address: p.address + 1 }))
              set({ pin: m.coordinates, label: m.name, area: null })
            }}
            emptyMessage={notFound}
          />
          {dropPin}
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-[var(--color-fg)]">Address</span>
            <input
              className="input"
              placeholder="915 I St, Sacramento"
              autoComplete="street-address"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), find())}
            />
          </label>
          <button type="button" onClick={find} disabled={finding} className="min-h-tap self-start text-sm font-medium text-[var(--color-accent)] underline">
            {finding ? 'Finding…' : 'Find it'}
          </button>
          {matches && matches.length === 0 && <p className="text-caption text-[var(--color-fg-muted)]">{notFound}</p>}
          {matches && matches.length > 0 && (
            <ul className="flex flex-col">
              {matches.map((m) => (
                <li key={m.name}>
                  <button
                    type="button"
                    className="min-h-tap w-full text-left text-sm hover:bg-[var(--color-surface)]"
                    onClick={() => {
                      set({ pin: m.coordinates, label: m.name, area: null })
                      setMatches(null)
                    }}
                  >
                    {m.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {shownPin && (
        <>
          {(value.label ?? value.area?.name) && <p className="text-sm text-[var(--color-fg)]">{value.label ?? value.area?.name}</p>}
          <PinAdjustMap center={shownPin} onChange={(pin) => set({ pin })} />
        </>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-sm text-[var(--color-fg)]">How to find us <span className="text-[var(--color-fg-muted)]">(optional)</span></span>
        <input
          className="input"
          maxLength={140}
          placeholder="Trailhead behind Drake’s: The Barn, West Sacramento"
          value={value.howToFind}
          onChange={(e) => set({ howToFind: e.target.value })}
        />
      </label>
      {variant === 'area' && (
        <p className="text-caption text-[var(--color-fg-muted)]">
          {value.area ? `Visitors see ${value.area.name}, with its pin at the centre, not your address.` : 'Pick your neighbourhood, or drop a pin and we’ll work it out.'}
        </p>
      )}
    </div>
  )
}

function Travel({ value, onChange }: { value: WhereValue['travel']; onChange: (v: WhereValue['travel']) => void }) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<Place[]>([])
  const has = (id: string) => value.towns.some((t) => t.id === id)
  const toggle = (p: Place) => onChange({ towns: has(p.id) ? value.towns.filter((t) => t.id !== p.id) : [...value.towns, p] })

  const search = async (q: string) => {
    setQuery(q)
    if (q.trim().length < 2) return setOptions([])
    const res = await searchPlacesAction(q).catch(() => null)
    setOptions(res && res.ok ? res.data.filter((m) => m.kind === 'city').map((m) => ({ id: m.id, name: m.name })) : [])
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-[var(--color-fg)]">
        {value.towns.length === 0 ? 'The whole Sacramento area.' : 'These towns:'}
      </p>
      {value.towns.length > 0 && (
        <ul className="flex flex-col">
          {value.towns.map((t) => (
            <li key={t.id} className="flex min-h-tap items-center justify-between gap-1 text-sm text-[var(--color-fg)]">
              {t.name}
              <button type="button" aria-label={`Remove ${t.name}`} onClick={() => toggle(t)} className="inline-flex size-tap items-center justify-center">
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-sm text-[var(--color-fg)]">Add a town <span className="text-[var(--color-fg-muted)]">(optional)</span></span>
        <input className="input" placeholder="Davis, Folsom…" value={query} onChange={(e) => search(e.target.value)} />
      </label>
      {options.length > 0 && (
        <ul className="flex flex-col">
          {options.map((o) => (
            <li key={o.id}>
              <button type="button" className="min-h-tap w-full text-left text-sm hover:bg-[var(--color-surface)]" onClick={() => (toggle(o), setOptions([]), setQuery(''))}>
                {o.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <AreaPickMap kinds={['city']} onPick={(p) => toggle({ id: p.placeId, name: p.name })} />
    </div>
  )
}
