'use client'

// plan #258 — one listener for the whole app: a tap on anything marked `data-map-tap` ("show_on_map" or
// "directions") is counted for the day, with the page it happened on (hashed server-side, never stored).

import { useEffect } from 'react'
import { logMapTapAction } from '@/app/_actions/map-actions'

const KINDS = ['show_on_map', 'directions'] as const
type Kind = (typeof KINDS)[number]
const isKind = (v: string | undefined): v is Kind => KINDS.includes(v as Kind)

export function MapTapCounter() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const kind = (e.target as Element | null)?.closest?.<HTMLElement>('[data-map-tap]')?.dataset.mapTap
      if (isKind(kind)) void logMapTapAction(kind, window.location.pathname)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])
  return null
}
