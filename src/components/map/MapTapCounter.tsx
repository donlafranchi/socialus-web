'use client'

// plan #258 — one listener for the whole app: a tap on anything marked `data-map-tap` ("show_on_map" or
// "directions") is counted for the day. The place is the link it opens (each Directions its own), else the page;
// it is hashed server-side for the once-a-day key and never stored.

import { useEffect } from 'react'
import { logMapTapAction } from '@/app/_actions/map-actions'

const KINDS = ['show_on_map', 'directions'] as const
type Kind = (typeof KINDS)[number]
const isKind = (v: string | undefined): v is Kind => KINDS.includes(v as Kind)

export function MapTapCounter() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>('[data-map-tap]')
      const kind = el?.dataset.mapTap
      if (isKind(kind)) void logMapTapAction(kind, el?.getAttribute('href') || window.location.pathname)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])
  return null
}
