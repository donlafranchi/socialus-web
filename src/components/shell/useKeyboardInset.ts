'use client'

import { useEffect, useState } from 'react'

/** Px the on-screen keyboard covers at the bottom, so a fixed bar can ride above it (iOS keeps the layout viewport put). */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const check = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)))
    check()
    vv.addEventListener('resize', check)
    vv.addEventListener('scroll', check)
    return () => {
      vv.removeEventListener('resize', check)
      vv.removeEventListener('scroll', check)
    }
  }, [])
  return inset
}
