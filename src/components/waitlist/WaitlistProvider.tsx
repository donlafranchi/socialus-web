'use client'

// #1299 — the journey's answers, held in this tab only until the finish sends them: nothing is written anywhere
// before the person taps Join on the last question. Survives a reload and Back (sessionStorage).

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { WaitlistAnswers } from '@/app/_actions/waitlist-journey-actions'

export type Answers = WaitlistAnswers & { market: string | null; waiting: number | null; joined: boolean }

const EMPTY: Answers = { plans: [], kinds: [], offerName: '', offerLink: '', name: '', zip: '', email: '', phone: '', market: null, waiting: null, joined: false }
const KEY = 'socialus.waitlist'

type Ctx = { answers: Answers; set: (patch: Partial<Answers>) => void; ready: boolean }
const WaitlistContext = createContext<Ctx>({ answers: EMPTY, set: () => {}, ready: false })

export function WaitlistProvider({ children }: { children: ReactNode }) {
  const [answers, setAnswers] = useState<Answers>(EMPTY)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one read of this tab's saved answers on mount
      if (saved) setAnswers({ ...EMPTY, ...JSON.parse(saved) })
    } catch {}
    setReady(true)
  }, [])

  const set = useCallback((patch: Partial<Answers>) => {
    setAnswers((prev) => {
      const next = { ...prev, ...patch }
      try {
        sessionStorage.setItem(KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }, [])

  return <WaitlistContext.Provider value={{ answers, set, ready }}>{children}</WaitlistContext.Provider>
}

export const useWaitlist = () => useContext(WaitlistContext)
