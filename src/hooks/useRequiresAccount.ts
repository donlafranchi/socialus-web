'use client'

// The one place an interaction asks "may this person do this?".
//
// Every gated control calls `guard(action, fn)`. Signed in, `fn` runs. Signed
// out, the prompt opens and nothing is sent. The control does not read the
// session itself and does not decide — a check re-implemented per call site is
// a check with a hole in it.
//
// This is the CLIENT half and it is a courtesy, not the boundary. The boundary
// is server-side: every handler already requires a signed-in member, so a
// direct call with the button hidden is refused regardless of what renders.

import { useCallback, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useAuth } from './useAuth'
import { parseIntent, type GatedAction } from '@/lib/auth/requires-account'

export function useRequiresAccount() {
  const { user, loading } = useAuth()
  const pathname = usePathname()
  const params = useSearchParams()
  const [prompting, setPrompting] = useState<GatedAction | null>(null)

  const signedIn = Boolean(user)

  /** Run `fn` if they may; otherwise open the prompt carrying the intent. */
  const guard = useCallback(
    (action: GatedAction, fn: () => void): void => {
      // Still resolving the session: do nothing rather than guess. Guessing
      // signed-out flashes a prompt at someone who is signed in.
      if (loading) return
      if (!signedIn) {
        setPrompting(action)
        return
      }
      fn()
    },
    [loading, signedIn],
  )

  /**
   * The intent carried back from sign-in, so the surface can finish what the
   * person started instead of making them find the control again.
   */
  const returningIntent = signedIn ? parseIntent(params.get('intent')) : null

  return {
    signedIn,
    loading,
    guard,
    prompting,
    dismissPrompt: useCallback(() => setPrompting(null), []),
    currentPath: pathname ?? '/',
    returningIntent,
  }
}
