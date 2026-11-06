'use client'

import { useEffect } from 'react'
import { markWelcomedAction } from './actions'

/** Seeing the welcome is what spends it, not tapping through: a closed tab never brings it back. */
export function MarkWelcomed() {
  useEffect(() => {
    void markWelcomedAction()
  }, [])
  return null
}
