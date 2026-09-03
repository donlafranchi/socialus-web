'use client'

// T115 — restore Explore's scroll position on back navigation (F045).
//
// The App Router's own restoration cannot help here: the results arrive after
// an async read, so at the moment the browser would restore, the page is one
// viewport tall and there is nothing to scroll to. This waits for `ready` —
// results painted — and only then jumps.
//
// Recording is deliberately gated on the same flag. A scroll event fired while
// the page is still short (the browser's own reset to 0) would otherwise
// overwrite the very position we are about to restore.

import { useEffect, useRef } from 'react'

const PREFIX = 'scroll:'

function read(key: string): number | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key)
    return raw === null ? null : Number(raw)
  } catch {
    return null
  }
}

function write(key: string, y: number) {
  try {
    sessionStorage.setItem(PREFIX + key, String(y))
  } catch {
    /* private mode, blocked site data — restoration is a convenience */
  }
}

export function useScrollRestoration(key: string, ready: boolean) {
  const restored = useRef(false)

  useEffect(() => {
    if (!ready || restored.current) return
    restored.current = true
    const y = read(key)
    if (y !== null && y > 0) window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior })
  }, [key, ready])

  useEffect(() => {
    if (!ready) return
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        write(key, window.scrollY)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [key, ready])
}
