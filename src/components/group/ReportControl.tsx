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
import { ReportSheet, PlainError } from './ReportSheet'
import type { ReportCategory } from '@/lib/reports/categories'
import { COPY } from '@/lib/copy'
import { URGENT_CATEGORIES } from '@/lib/reports/categories'
import { SignInPrompt } from '@/components/auth/SignInPrompt'

interface Props {
  subjectId: string
  /** F099 — which image: the Page's photo when omitted. */
  subjectKind?: 'group' | 'page_picture' | 'post_photo' | 'page_item'
  subjectLabel: string
  /** #625 — on a Page: its own words (name, description) are a report of their own, beside its photo. */
  wordsReportable?: boolean
  loggedIn: boolean
  /** Path to come back to after signing in. */
  returnTo?: string
  onSend: (input: {
    subjectId: string
    subjectKind?: 'group' | 'page_picture' | 'post_photo' | 'page_words' | 'page_item'
    category: ReportCategory
    body: string
  }) => Promise<{ ok: true } | { ok: false; message: string }>
}

export function ReportControl({ subjectId, subjectKind, subjectLabel, loggedIn, returnTo, onSend, wordsReportable = false }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [reporting, setReporting] = useState<'group' | 'page_picture' | 'post_photo' | 'page_words' | 'page_item' | undefined>(subjectKind)
  const open = (kind: typeof reporting) => {
    setReporting(kind)
    if (loggedIn) setSheetOpen(true)
    else setPromptOpen(true)
  }
  const [confirmed, setConfirmed] = useState<'courtesy' | 'person' | null>(null)
  const [promptOpen, setPromptOpen] = useState(false)
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
  // The shared prompt says why ("Sign in to report this") and carries the
  // intent through sign-in, so the report sheet can open on return.

  return (
    <>
      <PageOverflowMenu
        triggerRef={triggerRef}
        items={
          wordsReportable
            ? [
                { label: COPY.reportPageWords, onSelect: () => open('page_words') },
                { label: COPY.reportPagePhoto, onSelect: () => open(subjectKind) },
              ]
            : [{ label: 'Report this', onSelect: () => open(subjectKind) }]
        }
      />

      {promptOpen && <SignInPrompt action="report" currentPath={returnTo ?? '/'} onClose={() => setPromptOpen(false)} />}

      <ReportSheet
        open={sheetOpen}
        subjectLabel={reporting === 'page_words' ? `${subjectLabel}: ${COPY.reportPageWordsSubject}` : subjectLabel}
        returnFocusTo={triggerRef}
        onClose={() => setSheetOpen(false)}
        onSend={async (category, body) => {
          const sent = await onSend({ subjectId, ...(reporting ? { subjectKind: reporting } : {}), category, body })
          // The action returns plain words for a refusal; the sheet shows them and keeps the box.
          if (!sent.ok) throw new PlainError(sent.message)
          setSheetOpen(false)
          setConfirmed(URGENT_CATEGORIES.includes(category) ? 'person' : 'courtesy')
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
          className="fixed inset-x-4 bottom-20 z-50 flex items-center gap-3 rounded-lg bg-[var(--color-charcoal-700)] px-4 py-3 text-sm text-white shadow-overlay md:left-1/2 md:right-auto md:w-96 md:-translate-x-1/2"
        >
          <span className="flex-1">
            {confirmed === 'person' ? COPY.reportSentPerson : COPY.reportSentCourtesy}
          </span>
          <button
            type="button"
            onClick={() => setConfirmed(null)}
            className="shrink-0 rounded-full px-2 py-1 text-sm font-medium underline"
          >
            Dismiss
          </button>
        </div>
      )}
    </>
  )
}
