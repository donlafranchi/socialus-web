'use client'

// What a signed-out person sees when they tap something that touches another
// person. Not a wall — a reason and a way through.
//
// DEFERRED REGISTRATION is the point. The tap is not lost: `signInHref` carries
// both the path they were on and the intent they had, so the surface can finish
// the action once they are back rather than making them hunt for the control
// again. A prompt that discards the action trains people not to tap.

import Link from 'next/link'
import { promptFor, signInHref, type GatedAction } from '@/lib/auth/requires-account'

export function SignInPrompt({
  action,
  currentPath,
  onClose,
}: {
  action: GatedAction
  currentPath: string
  onClose: () => void
}) {
  const { title, why } = promptFor(action)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sign-in-prompt-title"
    >
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/30" />
      <div
        data-testid="sign-in-prompt"
        data-action={action}
        className="relative w-full max-w-sm rounded-t-lg bg-white p-5 pb-8 shadow-bar sm:rounded-lg sm:pb-5"
      >
        <h2 id="sign-in-prompt-title" className="text-lg font-semibold text-[var(--color-fg)]">
          {title}
        </h2>
        <p className="mt-2 text-sm text-[var(--color-fg-muted)]">{why}</p>

        <Link
          href={signInHref(action, currentPath)}
          data-testid="sign-in-prompt-continue"
          className="btn-primary mt-4 w-full"
        >
          Sign in
        </Link>
        <button
          type="button"
          onClick={onClose}
          data-testid="sign-in-prompt-dismiss"
          className="press mt-2 w-full py-2 text-sm text-[var(--color-fg-muted)] underline"
        >
          Not now
        </button>
      </div>
    </div>
  )
}
