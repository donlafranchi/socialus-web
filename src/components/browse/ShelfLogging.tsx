'use client'

// F121 criterion 11 — a shelf counts an impression when at least half of it is on screen for a second (once per
// mount; the server keeps one a day per member), a tap when a card link inside it is opened, and a save when
// that tap leads to a like, add to calendar, remind me or follow (`data-shelf-save`) on the card's page.

import { useEffect, useRef, type ReactNode } from 'react'
import { logShelfAction } from '@/app/_actions/shelf-actions'
import { rememberShelfTap, takeShelfCredit } from '@/lib/shelves/credit'

const SEEN_MS = 1000

export function LoggedShelf({ logId, children }: { logId: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    let timer: ReturnType<typeof setTimeout> | undefined
    const io = new IntersectionObserver(
      ([entry]) => {
        clearTimeout(timer)
        if (!entry?.isIntersecting || entry.intersectionRatio < 0.5) return
        timer = setTimeout(() => {
          io.disconnect()
          void logShelfAction(logId, 'impression')
        }, SEEN_MS)
      },
      { threshold: [0, 0.5] },
    )
    io.observe(el)
    return () => {
      clearTimeout(timer)
      io.disconnect()
    }
  }, [logId])

  const tapped = (e: React.MouseEvent) => {
    const href = (e.target as Element).closest?.('a[href]')?.getAttribute('href')
    if (!href) return
    void logShelfAction(logId, 'tap')
    try {
      rememberShelfTap(sessionStorage, logId, href)
    } catch {
      // Storage off: the tap still counts, a later save just isn't credited.
    }
  }

  return (
    <div ref={ref} onClickCapture={tapped} data-shelf={logId}>
      {children}
    </div>
  )
}

/** Mounted once in the shell: credits a save to the shelf its card was tapped on. */
export function ShelfSaveCredit() {
  useEffect(() => {
    const clicked = (e: MouseEvent) => {
      if (!(e.target as Element | null)?.closest?.('[data-shelf-save]')) return
      let shelfId: string | null = null
      try {
        shelfId = takeShelfCredit(sessionStorage, window.location.pathname)
      } catch {
        return
      }
      if (shelfId) void logShelfAction(shelfId, 'save')
    }
    document.addEventListener('click', clicked, true)
    return () => document.removeEventListener('click', clicked, true)
  }, [])
  return null
}
