'use client'

// #348 — where a Page is (Don, 2026-10-04, "the most elegant"): one question,
// three answers. Google Business Profile's two questions folded into one;
// Airbnb's confirm-the-pin and approximate location; Google Maps' drop a pin;
// Meetup's "how to find us". Minimal: one choice, then only its own fields.

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { geocode, type GeocodingResult } from '@/lib/geocoding'
import { placeForPointAction, searchNeighborhoodsAction, searchPlacesAction } from '@/app/_actions/location-actions'
import type { NeighborhoodMatch } from '@/lib/places/neighborhood-search'
import { PinAdjustMap } from './PinAdjustMap'
import { AreaPickMap } from './AreaPickMap'
import { Typeahead } from './Typeahead'
import { mapAvailable } from '@/lib/map-config'

export type WhereMode = 'visit' | 'travel' | 'roaming'
type Place = { id: string; name: string }

export interface WhereValue {
  mode: WhereMode | null
  visit: { pin: [number, number] | null; label: string | null; howToFind: string; areaOnly: boolean; area: Place | null }
  travel: { towns: Place[] }
  roaming: { usuallyAround: string }
}

export const emptyWhere: WhereValue = {
  mode: null,
  visit: { pin: null, label: null, howToFind: '', areaOnly: false, area: null },
  travel: { towns: [] },
  roaming: { usuallyAround: '' },
}

const SACRAMENTO: [number, number] = [-121.4944, 38.5816]

const ANSWERS: { mode: WhereMode; title: string; body: string }[] = [
  { mode: 'visit', title: 'People come to me', body: 'A shop, a studio, a trailhead: somewhere people can find you.' },
  { mode: 'travel', title: 'I go to them', body: 'You work at their place, anywhere in the towns you choose.' },
  { mode: 'roaming', title: 'It moves, or it’s online', body: 'Markets, pop-ups, a different spot each time, or no spot at all.' },
]

export function WhereFields({ value, onChange }: { value: WhereValue; onChange: (v: WhereValue) => void }) {
  const set = (patch: Partial<WhereValue>) => onChange({ ...value, ...patch })
  return (
    <fieldset className="flex flex-col gap-3" aria-label="How do people find you?">
      <legend className="text-sm font-medium text-[var(--color-fg)]">How do people find you?</legend>
      <div className="flex flex-col gap-2">
        {ANSWERS.map((a) => (
          <label
            key={a.mode}
            className={`flex cursor-pointer gap-3 rounded-md border p-3 ${
              value.mode === a.mode ? 'border-[var(--color-charcoal-700)]' : 'border-[var(--color-border)]'
            }`}
          >
            <input
              type="radio"
              name="where-mode"
              className="mt-1 h-4 w-4"
              checked={value.mode === a.mode}
              onChange={() => set({ mode: a.mode })}
              aria-labelledby={`where-${a.mode}-title`}
              aria-describedby={`where-${a.mode}-body`}
            />
            <span>
              <span id={`where-${a.mode}-title`} className="block text-body-sm font-semibold text-[var(--color-fg)]">
                {a.title}
              </span>
              <span id={`where-${a.mode}-body`} className="block text-caption text-[var(--color-fg-muted)]">
                {a.body}
              </span>
            </span>
          </label>
        ))}
      </div>
      {value.mode === 'visit' && <Visit value={value.visit} onChange={(visit) => set({ visit })} />}
      {value.mode === 'travel' && <Travel value={value.travel} onChange={(travel) => set({ travel })} />}
      {value.mode === 'roaming' && (
        <label className="flex flex-col gap-1">
          <span className="text-sm text-[var(--color-fg)]">Usually around <span className="text-[var(--color-fg-muted)]">(optional)</span></span>
          <input
            className="input"
            maxLength={80}
            placeholder="Midtown farmers markets"
            value={value.roaming.usuallyAround}
            onChange={(e) => set({ roaming: { usuallyAround: e.target.value } })}
          />
          <span className="text-caption text-[var(--color-fg-muted)]">You show up anywhere in the Sacramento area.</span>
        </label>
      )}
    </fieldset>
  )
}

function Visit({ value, onChange }: { value: WhereValue['visit']; onChange: (v: WhereValue['visit']) => void }) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<GeocodingResult[] | null>(null)
  const [finding, setFinding] = useState(false)
  // Choosing an address clears the neighbourhood field and the other way round.
  const [picks, setPicks] = useState({ address: 0, area: 0 })
  const set = (patch: Partial<WhereValue['visit']>) => onChange({ ...value, ...patch })

  // The neighbourhood follows the pin; it's worked out, never picked.
  const pinKey = value.pin?.join(',')
  useEffect(() => {
    if (!value.pin || !value.areaOnly) return
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
  const dropPin = mapAvailable() && !value.pin && (
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
      {/* #413 — with a map, the address suggests as you type and a neighbourhood is a second way in; without one, the lookup runs on request. */}
      {mapAvailable() ? (
        <>
          <Typeahead<GeocodingResult>
            key={`address-${picks.area}`}
            label="Address"
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
          <Typeahead<NeighborhoodMatch>
            key={`area-${picks.address}`}
            label="Or type a neighbourhood"
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
              set({ pin: n.centroid, label: null, area: { id: n.placeId, name: n.name } })
            }}
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
      {value.pin && (
        <>
          {(value.label ?? value.area?.name) && <p className="text-sm text-[var(--color-fg)]">{value.label ?? value.area?.name}</p>}
          <PinAdjustMap center={value.pin} onChange={(pin) => set({ pin })} />
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
      <label className="flex min-h-tap cursor-pointer items-center justify-between gap-3">
        <span className="text-sm text-[var(--color-fg)]">Show only my neighbourhood</span>
        <button
          type="button"
          role="switch"
          aria-checked={value.areaOnly}
          aria-label="Show only my neighbourhood"
          onClick={() => set({ areaOnly: !value.areaOnly })}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            value.areaOnly ? 'bg-[var(--color-charcoal-700)]' : 'bg-[var(--color-border)]'
          }`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${value.areaOnly ? 'left-5' : 'left-0.5'}`} />
        </button>
      </label>
      {value.areaOnly && (
        <p className="text-caption text-[var(--color-fg-muted)]">
          {value.area ? `Visitors see ${value.area.name}, with its pin at the centre, not your address.` : 'Set your pin first, and visitors see only its neighbourhood.'}
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
        <ul className="flex flex-wrap gap-2">
          {value.towns.map((t) => (
            <li key={t.id} className="flex min-h-tap items-center gap-1 rounded-full border border-[var(--color-border)] pl-3 text-sm">
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
