'use client'

// #648 part 2 — a held (child-safety) row: how long it is kept, and the NCMEC report number once the operator has
// filed the manual CyberTipline form (beta). Operator-only screen; nothing here reaches a member.

import { useState } from 'react'
import { buttonClass } from '@/components/ui/Button'
import type { ReviewSubject } from '@/lib/admin/review-subjects'

type Hold = NonNullable<ReviewSubject['hold']>
const day = (d: Date) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' }).format(d)

// [open-question owner=don raised=2026-10-13] When the entity is set up and we go public: register SocialUs with the CyberTipline and switch from this manual form to the reporting process NCMEC gives an ESP (#648, PM 2026-10-11).
export function NcmecRecord({ hold, onRecord }: { hold: Hold; onRecord: (input: { reportId: string; reportNumber: string }) => Promise<void> }) {
  const [number, setNumber] = useState('')
  const [saved, setSaved] = useState<{ number: string; at: Date } | null>(
    hold.ncmecReportNumber ? { number: hold.ncmecReportNumber, at: hold.ncmecReportedAt ?? new Date() } : null,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function save() {
    setBusy(true)
    setError(false)
    try {
      await onRecord({ reportId: hold.reportId, reportNumber: number.trim() })
      setSaved({ number: number.trim(), at: new Date() })
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="flex list-none flex-col gap-2 text-body-sm" data-testid="hold">
      <p data-testid="hold-kept">Kept as evidence until {day(hold.retainUntil)}. Do not delete it.</p>
      <p data-testid="hold-ncmec">
        {saved
          ? `Reported to NCMEC: report ${saved.number}, ${day(saved.at)}.`
          : 'Not reported to NCMEC yet. File at report.cybertip.org (steps are in the Safety runbook), then record the number here.'}
      </p>
      {!saved && (
        <div className="flex flex-col gap-2">
          <label htmlFor={`ncmec-${hold.reportId}`} className="text-caption font-medium">
            NCMEC report number
          </label>
          <input id={`ncmec-${hold.reportId}`} className="input" inputMode="numeric" autoComplete="off" value={number} onChange={(e) => setNumber(e.target.value)} />
          <button type="button" className={`${buttonClass('secondary')} min-h-12!`} disabled={busy || number.trim() === ''} onClick={() => void save()}>
            Save
          </button>
          {error && (
            <p role="alert" className="text-caption">
              That didn&apos;t save. Mind trying again?
            </p>
          )}
        </div>
      )}
    </li>
  )
}
