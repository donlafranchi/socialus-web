'use client'

// #791 — a long list renders a step at a time and grows as its end nears (web.dev "virtualize
// large lists"; the infinite-scroll lists of Instagram and Airbnb). Every render of Explore drew
// all 194 cards, so each tap there waited on them. How deep the visitor went is kept for the
// session, so coming back renders as far and the scroll position can be restored (`settled`).

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

export const REVEAL_STEP = 24
const PREFIX = 'reveal:'
// Well before the end comes into view, so a fast scroll does not hit it.
const AHEAD = '1500px 0px'

function read(key: string): number {
  try {
    return Number(sessionStorage.getItem(PREFIX + key)) || REVEAL_STEP
  } catch {
    return REVEAL_STEP
  }
}

function write(key: string, n: number) {
  try {
    sessionStorage.setItem(PREFIX + key, String(n))
  } catch {
    /* private mode, blocked site data — depth is a convenience */
  }
}

const noSubscribe = () => () => {}
const canWatch = () => typeof IntersectionObserver !== 'undefined'

export function useRevealOnScroll(key: string, total: number, reset: string) {
  // The server and hydration agree on one step (null here); the session's depth follows.
  const saved = useSyncExternalStore(noSubscribe, () => (canWatch() ? read(key) : Number.MAX_SAFE_INTEGER), () => null)
  const [own, setOwn] = useState<number | null>(null)
  const [lastReset, setLastReset] = useState(reset)
  if (reset !== lastReset) {
    setLastReset(reset)
    setOwn(REVEAL_STEP)
  }
  const count = saved === Number.MAX_SAFE_INTEGER ? saved : (own ?? saved ?? REVEAL_STEP)
  const [el, setEl] = useState<Element | null>(null)

  useEffect(() => {
    if (own !== null && saved !== Number.MAX_SAFE_INTEGER) write(key, own)
  }, [key, own, saved])

  // Re-observed after each step: a sentinel still in range must fire again.
  useEffect(() => {
    if (!el || !canWatch()) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setOwn(count + REVEAL_STEP)
      },
      { rootMargin: AHEAD },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [el, count])

  const sentinel = useCallback((node: Element | null) => setEl(node), [])
  return { shown: Math.min(count, total), settled: saved !== null, sentinel }
}
