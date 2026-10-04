'use client'

// T142 — shared "where is it" fields: an address combobox backed by the
// existing forward geocoder, or a neighbourhood picker for a Location with
// no fixed address. One component, reused inside the Sell walkthrough's,
// the product composer's, and the service composer's "Add a new Location"
// drawers — so the address-search and neighbourhood-toggle behavior is
// identical everywhere a Location gets created (review binding note 1's
// "one module, every caller" argument, applied to this surface).
//
// Design-language gap: there's no image-picker-style recipe for a
// combobox or a map thumbnail in this codebase yet (confirmed — grepped
// src/components/ for both). Built fresh here, to the ticket's explicit
// accessibility requirements (combobox + listbox pattern, a real <select>
// for the neighbourhood list, the map thumbnail as decorative with a text
// equivalent) rather than waiting on a design-language pass that would
// block this ticket.

import { useEffect, useRef, useState } from 'react'
import { geocode, GeocodingUnavailableError, type GeocodingResult } from '@/lib/geocoding'
import { searchPlacesAction } from '@/app/_actions/location-actions'
import { mergeMatches, type Suggestion } from '@/lib/places/suggestions'
import { placeKindLabel } from '@/lib/places/search'
import { PinAdjustMap } from './PinAdjustMap'
import { AreaPickMap } from './AreaPickMap'

export type PlaceMode = 'address' | 'neighbourhood'

export interface LocationPlaceFieldsState {
  mode: PlaceMode
  addressQuery: string
  selectedAddress: GeocodingResult | null
  neighborhoodId: string | null
}

export const initialLocationPlaceFieldsState: LocationPlaceFieldsState = {
  mode: 'address',
  addressQuery: '',
  selectedAddress: null,
  neighborhoodId: null,
}

export function isLocationPlaceFieldsComplete(s: LocationPlaceFieldsState): boolean {
  return s.mode === 'address' ? s.selectedAddress !== null : s.neighborhoodId !== null
}


export function LocationPlaceFields({
  state,
  setState,
  idPrefix,
}: {
  state: LocationPlaceFieldsState
  setState: (next: LocationPlaceFieldsState) => void
  /** Distinguishes data-testids across the three composers that embed this. */
  idPrefix: string
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [addressError, setAddressError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])


  function handleAddressQueryChange(value: string) {
    setState({ ...state, addressQuery: value, selectedAddress: null, neighborhoodId: null })
    setAddressError(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.trim().length < 2) {
      setSuggestions([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      if (!mountedRef.current) return
      setSearching(true)
      // Both sources at once, and one failing does not take the other down:
      // our places need no token, Mapbox does, and production has run without
      // one. A person must still be able to finish.
      const [placesOutcome, addressOutcome] = await Promise.allSettled([
        searchPlacesAction(value),
        geocode(value),
      ])
      if (!mountedRef.current) return

      const placeRows: Suggestion[] =
        placesOutcome.status === 'fulfilled' && placesOutcome.value.ok
          ? placesOutcome.value.data.map((m) => ({
              source: 'place' as const,
              kind: m.kind,
              label: m.name,
              sublabel: m.parentName,
              placeId: m.id,
            }))
          : []

      const addressRows: Suggestion[] =
        addressOutcome.status === 'fulfilled'
          ? addressOutcome.value.map((a) => ({
              source: 'address' as const,
              kind: 'address' as const,
              label: a.name,
              sublabel: null,
              address: a,
            }))
          : []

      const merged = mergeMatches(placeRows, addressRows)
      setSuggestions(merged)

      const addressUnavailable =
        addressOutcome.status === 'rejected' &&
        addressOutcome.reason instanceof GeocodingUnavailableError

      if (merged.length === 0) {
        setAddressError(
          addressUnavailable
            ? 'Address search is unavailable right now. Try a city or a neighbourhood.'
            : "We couldn't find that. Try a city or a neighbourhood instead.",
        )
      } else if (addressUnavailable) {
        // Places still came back, so this is a note rather than a failure.
        setAddressError('Address search is unavailable right now, so these are cities and neighbourhoods.')
      }
      setSearching(false)
    }, 300)
  }

  function selectSuggestion(s: Suggestion) {
    if (s.source === 'address') {
      setState({
        ...state,
        mode: 'address',
        addressQuery: s.label,
        selectedAddress: s.address,
        neighborhoodId: null,
      })
    } else {
      // A city or a neighbourhood goes down the same path a neighbourhood
      // always did: the action derives an interior point from the place's
      // bounding box. Cities have geography too, so nothing new is needed.
      setState({
        ...state,
        mode: 'neighbourhood',
        addressQuery: s.label,
        selectedAddress: null,
        neighborhoodId: s.placeId,
      })
    }
    setSuggestions([])
    setAddressError(null)
  }


  return (
    <div className="space-y-3">
      {state.mode === 'address' ? (
        <div>
          <label className="block" htmlFor={`${idPrefix}-address-input`}>
            <span className="text-sm font-medium text-[var(--color-fg)]">Where is it?</span>
          </label>
          <div className="relative">
            <input
              id={`${idPrefix}-address-input`}
              data-testid={`${idPrefix}-address-input`}
              role="combobox"
              aria-expanded={suggestions.length > 0}
              aria-controls={`${idPrefix}-address-listbox`}
              aria-describedby={addressError ? `${idPrefix}-address-error` : undefined}
              aria-autocomplete="list"
              className="input mt-1 w-full"
              placeholder="A street, a city, or a neighbourhood"
              value={state.addressQuery}
              onChange={(e) => handleAddressQueryChange(e.target.value)}
              autoComplete="off"
            />
            {suggestions.length > 0 && (
              <ul
                id={`${idPrefix}-address-listbox`}
                role="listbox"
                aria-label="Places and addresses"
                data-testid={`${idPrefix}-address-suggestions`}
                className="absolute z-10 mt-1 w-full rounded-lg border border-neutral-200 bg-white shadow-lift"
              >
                {suggestions.map((s, i) => (
                  <li
                    key={`${s.source}-${s.label}-${i}`}
                    role="option"
                    aria-selected={state.selectedAddress?.name === s.label}
                  >
                    <button
                      type="button"
                      data-testid={`${idPrefix}-address-suggestion-${i}`}
                      className="flex min-h-tap w-full items-center justify-between gap-3 px-3 text-left text-sm hover:bg-neutral-50"
                      onClick={() => selectSuggestion(s)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{s.label}</span>
                        {s.sublabel && (
                          <span className="block truncate text-xs text-[var(--color-fg-muted)]">
                            {s.sublabel}
                          </span>
                        )}
                      </span>
                      {/* What kind of place this is, in words. Never the column value. */}
                      <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs">
                        {s.source === 'address' ? 'Address' : placeKindLabel(s.kind)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {searching && <p className="text-xs text-[var(--color-fg-muted)]">Searching…</p>}
          {addressError && (
            <p id={`${idPrefix}-address-error`} role="alert" className="text-xs text-[var(--color-danger)]">
              {addressError}
            </p>
          )}
          {state.selectedAddress && (
            <div className="mt-2 flex flex-col gap-2" data-testid={`${idPrefix}-address-confirmed`}>
              <span className="text-sm text-[var(--color-fg)]">{state.selectedAddress.name}</span>
              {/* #348 — confirm it on the map, Airbnb-style. */}
              <PinAdjustMap
                center={state.selectedAddress.coordinates}
                onChange={(coordinates) =>
                  setState({ ...state, selectedAddress: { ...state.selectedAddress!, coordinates } })
                }
              />
            </div>
          )}
          <button
            type="button"
            data-testid={`${idPrefix}-mode-neighbourhood`}
            className="mt-1 flex min-h-tap items-center text-sm text-[var(--color-accent)] underline"
            onClick={() => setState({ ...state, mode: 'neighbourhood' })}
          >
            Rather give a neighbourhood?
          </button>
        </div>
      ) : (
        // Issue #180 — neighbourhood mode used to render NOTHING.
        //
        // `state.mode === 'address' ? (…) : null` meant that clicking "Rather
        // give a neighbourhood?" replaced the whole control with an empty
        // panel: no input, no list, no way back. The only path that ever set
        // this mode and still showed something was picking a place out of the
        // suggestions, which leaves the mode set and the search box gone.
        // Found while embedding this component in the Page edit form, where an
        // owner changing their address would have hit the dead end.
        <NeighbourhoodPicker state={state} setState={setState} idPrefix={idPrefix} />
      )}
    </div>
  )
}

// #348 — neighbourhood only: a search box over our neighbourhoods and towns,
// and the same places as outlines on a map to tap (Nextdoor, Zillow). Visitors
// see the neighbourhood's name; its pin sits at the neighbourhood's centre.
function NeighbourhoodPicker({
  state,
  setState,
  idPrefix,
}: {
  state: LocationPlaceFieldsState
  setState: (next: LocationPlaceFieldsState) => void
  idPrefix: string
}) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<{ id: string; name: string; parentName: string | null; kind: string }[]>([])
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listId = `${idPrefix}-neighbourhood-options`

  const choose = (placeId: string, name: string) => {
    setState({ ...state, mode: 'neighbourhood', neighborhoodId: placeId, addressQuery: name, selectedAddress: null })
    setQuery('')
    setOptions([])
  }

  const search = (value: string) => {
    setQuery(value)
    if (debounce.current) clearTimeout(debounce.current)
    if (value.trim().length < 2) return setOptions([])
    debounce.current = setTimeout(async () => {
      const res = await searchPlacesAction(value).catch(() => null)
      setOptions(res && res.ok ? res.data : [])
    }, 300)
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-[var(--color-fg)]">Neighbourhood or town</span>
        <input
          role="combobox"
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          className="input"
          data-testid={`${idPrefix}-neighbourhood-input`}
          placeholder="Curtis Park, Carmichael, Davis…"
          value={query}
          onChange={(e) => search(e.target.value)}
        />
      </label>
      {options.length > 0 && (
        <ul id={listId} role="listbox" className="rounded-md border border-[var(--color-border)] bg-white">
          {options.map((o) => (
            <li
              key={o.id}
              role="option"
              aria-selected={state.neighborhoodId === o.id}
              tabIndex={0}
              onClick={() => choose(o.id, o.name)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), choose(o.id, o.name))}
              className="flex min-h-tap cursor-pointer items-center justify-between gap-2 px-3 text-sm hover:bg-[var(--color-surface)]"
            >
              <span>{o.name}</span>
              <span className="text-caption text-[var(--color-fg-muted)]">
                {o.kind === 'neighborhood' && o.parentName ? o.parentName : placeKindLabel(o.kind)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <AreaPickMap selectedPlaceId={state.neighborhoodId} onPick={(p) => choose(p.placeId, p.name)} />
      <p data-testid={`${idPrefix}-neighbourhood-chosen`} className="text-sm text-[var(--color-fg)]">
        {state.neighborhoodId ? state.addressQuery : null}
      </p>
      <p className="text-caption text-[var(--color-fg-muted)]">
        Only the neighbourhood shows to visitors, with its pin at the centre.
      </p>
      <button
        type="button"
        data-testid={`${idPrefix}-mode-address`}
        className="flex min-h-tap items-center self-start text-sm text-[var(--color-accent)] underline"
        onClick={() => setState({ ...state, mode: 'address', selectedAddress: null, neighborhoodId: null })}
      >
        Use a street address instead
      </button>
    </div>
  )
}
