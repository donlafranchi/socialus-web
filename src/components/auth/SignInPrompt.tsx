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
import { Sheet } from '@/components/ui/Sheet'

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

  // #297 — L19, on the shared sheet.
  return (
    <Sheet open title={title} onClose={onClose} testId="sign-in-prompt" description={why}>
      <div data-action={action}>
        <Link
          href={signInHref(action, currentPath)}
          data-testid="sign-in-prompt-continue"
          className="btn-primary w-full"
          data-autofocus
        >
          Sign in
        </Link>
        <button
          type="button"
          onClick={onClose}
          data-testid="sign-in-prompt-dismiss"
          className="press mt-2 w-full py-2 text-body-sm text-[var(--color-fg-muted)] underline"
        >
          Not now
        </button>
      </div>
    </Sheet>
  )
}
