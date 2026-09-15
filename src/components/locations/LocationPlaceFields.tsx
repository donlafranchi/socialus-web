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
import { sellListNeighborhoodsAction, type Neighborhood } from '@/app/you/sell/actions'

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

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

function staticMapUrl(lng: number, lat: number): string | null {
  if (!MAPBOX_TOKEN) return null
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+e11d48(${lng},${lat})/${lng},${lat},14,0/240x140@2x?access_token=${MAPBOX_TOKEN}`
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
  const [suggestions, setSuggestions] = useState<GeocodingResult[]>([])
  const [searching, setSearching] = useState(false)
  const [addressError, setAddressError] = useState<string | null>(null)
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([])
  const [neighborhoodsLoaded, setNeighborhoodsLoaded] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  useEffect(() => {
    if (state.mode === 'neighbourhood' && !neighborhoodsLoaded) {
      sellListNeighborhoodsAction()
        .then((rows) => {
          if (!mountedRef.current) return
          setNeighborhoods(rows)
          setNeighborhoodsLoaded(true)
        })
        .catch(() => {
          if (mountedRef.current) setNeighborhoodsLoaded(true)
        })
    }
  }, [state.mode, neighborhoodsLoaded])

  function handleAddressQueryChange(value: string) {
    setState({ ...state, addressQuery: value, selectedAddress: null })
    setAddressError(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.trim().length < 3) {
      setSuggestions([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      if (!mountedRef.current) return
      setSearching(true)
      try {
        const results = await geocode(value)
        if (!mountedRef.current) return
        setSuggestions(results)
        if (results.length === 0) {
          setAddressError(
            "We couldn't find that address. Try a nearby cross-street or landmark.",
          )
        }
      } catch (err) {
        if (!mountedRef.current) return
        setSuggestions([])
        // Not the person's fault, and saying so matters: the old copy told
        // them their address did not exist when the search had never run.
        setAddressError(
          err instanceof GeocodingUnavailableError
            ? 'Address search is unavailable right now. You can pick a neighbourhood instead.'
            : "We couldn't find that address. Try a nearby cross-street or landmark.",
        )
      } finally {
        if (mountedRef.current) setSearching(false)
      }
    }, 300)
  }

  function selectSuggestion(s: GeocodingResult) {
    setState({ ...state, addressQuery: s.name, selectedAddress: s })
    setSuggestions([])
    setAddressError(null)
  }

  return (
    <div className="space-y-3">
      {state.mode === 'address' ? (
        <div>
          <label className="block" htmlFor={`${idPrefix}-address-input`}>
            <span className="text-sm font-medium text-[var(--color-fg)]">Address</span>
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
              placeholder="123 Main St, Sacramento, CA"
              value={state.addressQuery}
              onChange={(e) => handleAddressQueryChange(e.target.value)}
              autoComplete="off"
            />
            {suggestions.length > 0 && (
              <ul
                id={`${idPrefix}-address-listbox`}
                role="listbox"
                aria-label="Address suggestions"
                data-testid={`${idPrefix}-address-suggestions`}
                className="absolute z-10 mt-1 w-full rounded-lg border border-neutral-200 bg-white shadow-md"
              >
                {suggestions.map((s, i) => (
                  <li key={`${s.name}-${i}`} role="option" aria-selected={state.selectedAddress?.name === s.name}>
                    <button
                      type="button"
                      data-testid={`${idPrefix}-address-suggestion-${i}`}
                      className="flex min-h-[44px] w-full items-center px-3 text-left text-sm hover:bg-neutral-50"
                      onClick={() => selectSuggestion(s)}
                    >
                      {s.name}
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
            <div className="mt-2 flex items-center gap-3" data-testid={`${idPrefix}-address-confirmed`}>
              {staticMapUrl(state.selectedAddress.coordinates[0], state.selectedAddress.coordinates[1]) && (
                // Decorative — the resolved address text beside it is the
                // real confirmation, for a screen-reader user and for
                // anyone whose network drops the image. A remote Mapbox
                // static-image URL can't go through next/image without
                // allowlisting the domain for a one-off decorative thumbnail.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={staticMapUrl(state.selectedAddress.coordinates[0], state.selectedAddress.coordinates[1])!}
                  alt=""
                  aria-hidden="true"
                  width={80}
                  height={47}
                  className="rounded-md border border-neutral-200"
                />
              )}
              <span className="text-sm text-[var(--color-fg)]">{state.selectedAddress.name}</span>
            </div>
          )}
          <button
            type="button"
            data-testid={`${idPrefix}-mode-neighbourhood`}
            className="mt-1 flex min-h-[44px] items-center text-sm text-[var(--color-accent)] underline"
            onClick={() => setState({ ...state, mode: 'neighbourhood' })}
          >
            Rather give a neighbourhood?
          </button>
        </div>
      ) : (
        <div>
          <label className="block" htmlFor={`${idPrefix}-neighbourhood-select`}>
            <span className="text-sm font-medium text-[var(--color-fg)]">Neighbourhood</span>
          </label>
          <select
            id={`${idPrefix}-neighbourhood-select`}
            data-testid={`${idPrefix}-neighbourhood-select`}
            className="input mt-1 w-full"
            value={state.neighborhoodId ?? ''}
            onChange={(e) => setState({ ...state, neighborhoodId: e.target.value || null })}
          >
            <option value="" disabled>
              Choose a neighbourhood
            </option>
            {neighborhoods.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-testid={`${idPrefix}-mode-address`}
            className="mt-1 flex min-h-[44px] items-center text-sm text-[var(--color-accent)] underline"
            onClick={() => setState({ ...state, mode: 'address' })}
          >
            Give a street address instead
          </button>
        </div>
      )}
    </div>
  )
}
