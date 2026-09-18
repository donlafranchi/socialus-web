'use client'

// T160 (Issue #62) — the ⋯ and the sheet, wired together.
//
// Split from both so each stays a container: PageOverflowMenu knows nothing
// about reports, ReportSheet knows nothing about menus, and this is the only
// file that knows F058 exists.
//
// After a send, NOTHING on the page changes except the confirmation. Not a
// count, not a badge, not a "you reported this" marker — and in particular not
// whether the photo was hidden. `report.create` returns that, and the server
// action deliberately drops it before it reaches the browser: telling the
// reporter would disclose that a Page is already reported, already locked, or
// that they have hit their own cap. F058 acceptance 2 is that a report changes
// nothing visible to anyone, and the reporter is part of "anyone".

import { useRef, useState } from 'react'
import { PageOverflowMenu } from './PageOverflowMenu'
import { ReportSheet } from './ReportSheet'
import { signInHref as gatedSignInHref } from '@/lib/auth/requires-account'

interface Props {
  subjectId: string
  subjectLabel: string
  loggedIn: boolean
  /** Path to come back to after signing in. */
  returnTo?: string
  onSend: (input: { subjectId: string; body: string }) => Promise<{ ok: true }>
}

export function ReportControl({ subjectId, subjectLabel, loggedIn, returnTo, onSend }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  // The sheet is opened from a menu item that unmounts with its menu, so the
  // sheet cannot work out on its own where focus came from. Escape must land
  // back on the ⋯, which is the control the member was actually using.
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Signed out: the control is still there and still says what it does. It
  // leads to sign-in rather than to a disabled button or a dead end — a member
  // who wants to report something should never have to guess whether they are
  // allowed to.
  //
  // Reporting sits inside the wall by Don's ruling of 2026-09-18, and the
  // reasoning is worth keeping at the call site: requiring an account buys no
  // identity — accountability here is visibility and peer pressure, already
  // ruled — it buys CONTINUITY. An account is persistent, rate-limitable and
  // revocable; an anonymous reporter is none of those, which is what makes the
  // report-bombing caps in report.create possible at all.
  //
  // Now routed through the shared helper so the intent survives sign-in and the
  // report sheet can open on return, rather than the tap being lost.
  const signInHref = gatedSignInHref('report', returnTo ?? '/')

  return (
    <>
      <PageOverflowMenu
        triggerRef={triggerRef}
        items={[
          loggedIn
            ? { label: 'Report to the operator', onSelect: () => setSheetOpen(true) }
            : { label: 'Report to the operator', href: signInHref },
        ]}
      />

      <ReportSheet
        open={sheetOpen}
        subjectLabel={subjectLabel}
        returnFocusTo={triggerRef}
        onClose={() => setSheetOpen(false)}
        onSend={async (body) => {
          await onSend({ subjectId, body })
          setSheetOpen(false)
          setConfirmed(true)
        }}
      />

      {/* Fixed, bottom-anchored, and OUTSIDE the header's flow on purpose.
          Rendered inline it became a flex sibling of the ⋯ and squeezed the
          Page title into two lines — the confirmation is not a control and
          must not participate in the header's layout. Bottom is also where
          the thumb already is (design-language principle 8). */}
      {confirmed && (
        <div
          role="status"
          data-testid="report-sent"
          className="fixed inset-x-4 bottom-20 z-50 flex items-center gap-3 rounded-2xl bg-[var(--color-charcoal-700)] px-4 py-3 text-sm text-white shadow-lg md:left-1/2 md:right-auto md:w-96 md:-translate-x-1/2"
        >
          <span className="flex-1">
            Thank you — that went to a person, and they&rsquo;ll take a look.
          </span>
          <button
            type="button"
            onClick={() => setConfirmed(false)}
            className="shrink-0 rounded-full px-2 py-1 text-sm font-medium underline"
          >
            Dismiss
          </button>
        </div>
      )}
    </>
  )
}
