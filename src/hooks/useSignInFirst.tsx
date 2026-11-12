'use client'

// F134.4 — every write asks first, and the tap completes after sign-in (deferred registration, 2026-09-18).
//
// Signed out, `ask(fn)` opens the sign-in sheet and runs nothing: no save is sent and none is attempted, so a
// control cannot "save and then ask". The sheet's link carries `intent=<action>:<target>` back through sign-in; on
// the way back the one control whose action and target match runs `onReturn` once, and the intent is taken off the
// address so a reload does not do it again.
//
// The boundary is still the server and the database: every handler refuses a signed-out caller and `anon` holds no
// write privilege (F134.5). This is the courtesy that makes the refusal a question instead of a dead end.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { SignInPrompt } from '@/components/auth/SignInPrompt'
import { parseIntent, type GatedAction } from '@/lib/auth/requires-account'

const here = () => (typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search)

export function useSignInFirst({
  action,
  target = null,
  signedIn,
  returnTo,
  onReturn,
}: {
  action: GatedAction
  target?: string | null
  /** Undefined while the session is still being read: nothing runs and nothing asks. */
  signedIn: boolean | undefined
  returnTo?: string | null
  /** What the tap does, run once when the visitor comes back signed in. */
  onReturn?: () => void
}): { ask: (fn: () => void) => void; prompt: () => void; sheet: ReactNode } {
  const [asking, setAsking] = useState(false)
  const done = useRef(false)
  const finish = useRef(onReturn)
  useEffect(() => {
    finish.current = onReturn
  })

  useEffect(() => {
    if (signedIn !== true || done.current || !finish.current) return
    const url = new URL(window.location.href)
    const intent = parseIntent(url.searchParams.get('intent'))
    if (!intent || intent.action !== action || intent.target !== (target ?? null)) return
    done.current = true
    url.searchParams.delete('intent')
    window.history.replaceState(window.history.state, '', url.toString())
    finish.current()
  }, [signedIn, action, target])

  const ask = useCallback(
    (fn: () => void) => {
      if (signedIn === undefined) return
      if (signedIn) fn()
      else setAsking(true)
    },
    [signedIn],
  )

  const sheet = asking ? (
    <SignInPrompt action={action} target={target} currentPath={returnTo ?? here()} onClose={() => setAsking(false)} />
  ) : null
  // A session that ended mid-visit: the server said signed out, so ask now, whatever the page thought.
  const prompt = useCallback(() => setAsking(true), [])
  return { ask, prompt, sheet }
}
