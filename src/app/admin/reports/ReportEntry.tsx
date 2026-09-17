'use client'

// One report, reviewable on a phone without looking at the image first.
//
// THE IMAGE DOES NOT RENDER ON LOAD (#12). It sits behind a deliberate tap,
// blurred until then, and the control says what it does. Two taps, never one.
// The reason is not squeamishness: the operator is a person who will do this
// many times, and the worst thing in the queue should not be the first thing
// their eye lands on. Everything needed to judge most reports — what the
// reporter wrote, whose Page, how long it has been hidden — is readable
// without it.
//
// THE TWO OUTCOMES ARE NOT EQUALLY EASY, deliberately. Restore is one tap:
// it is reversible, it is the common case, and throughput is the point.
// Remove is permanent, so it asks once. Friction on the destructive side only
// — adding it to both would slow the queue to protect against half the risk.

import { useState, useTransition } from 'react'
import type { QueuedReport } from '@/lib/admin/reports-queue'

export function ReportEntry({
  report,
  hiddenFor,
  onRestore,
  onRemove,
}: {
  report: QueuedReport
  hiddenFor: string | null
  onRestore: (id: string) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) {
  const [shown, setShown] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const run = (fn: (id: string) => Promise<void>) => {
    setError(null)
    startTransition(async () => {
      try {
        await fn(report.reportId)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That did not go through.')
      }
    })
  }

  return (
    <li
      data-testid="report-entry"
      data-report-id={report.reportId}
      className="card p-4 flex flex-col gap-3"
    >
      <div>
        <p className="text-sm font-semibold text-[var(--color-fg)]">{report.groupName}</p>
        {/* Who posted it. Don's ruling of 2026-09-17: content posted to the
            platform is subject to review by the platform. This is the display
            name and handle, which is all the platform holds — there is no
            legal_name column. */}
        <p className="text-xs text-[var(--color-fg-muted)]">
          {report.ownerDisplayName ?? 'Unknown member'}
          {report.ownerHandle ? ` · @${report.ownerHandle}` : ''}
        </p>
      </div>

      {/* Readable without the image. This is the part most reports are decided on. */}
      <blockquote className="border-l-2 border-[var(--color-border)] pl-3 text-sm text-[var(--color-fg)]">
        {report.body}
      </blockquote>

      <p className="text-xs text-[var(--color-fg-muted)]">
        {hiddenFor ? `Hidden ${hiddenFor}` : 'Not hidden'} · reported{' '}
        {report.reportedAt.toISOString().slice(0, 10)}
      </p>

      {report.photoUrl ? (
        <div className="relative overflow-hidden rounded-xl bg-[var(--color-surface)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={report.photoUrl}
            alt={shown ? 'The reported photo' : ''}
            data-testid="reported-photo"
            data-shown={shown ? 'true' : 'false'}
            className="w-full object-cover transition-[filter] duration-200"
            style={{ filter: shown ? 'none' : 'blur(24px)', maxHeight: '18rem' }}
          />
          {!shown ? (
            <button
              type="button"
              onClick={() => setShown(true)}
              data-testid="show-photo"
              className="press absolute inset-0 m-auto h-11 w-36 rounded-full bg-[var(--color-fg)]/85 text-sm font-medium text-white"
            >
              Show photo
            </button>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-[var(--color-fg-muted)]">This Page has no photo.</p>
      )}

      {/* Restore first and one tap: reversible, common, and the queue moves. */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(onRestore)}
          data-testid="restore-photo"
          className="btn-secondary w-full disabled:opacity-50"
        >
          Restore photo
        </button>

        {confirming ? (
          <div className="flex gap-2" data-testid="remove-confirm">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(onRemove)}
              data-testid="remove-confirm-yes"
              className="press w-full rounded-xl bg-[var(--color-danger,#b3261e)] py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? 'Removing…' : 'Yes, remove for good'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="btn-secondary w-full"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirming(true)}
            data-testid="remove-photo"
            className="press w-full rounded-xl border border-[var(--color-border)] py-3 text-sm font-medium text-[var(--color-fg)] disabled:opacity-50"
          >
            Remove for good
          </button>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-fg)]">
          {error}
        </p>
      ) : null}
    </li>
  )
}
