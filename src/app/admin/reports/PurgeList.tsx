'use client'

// #491 — removed photos waiting to be deleted for good. Unlike decide and
// reverse this has a confirmation, because there is no undo behind it
// (docs/purge-proposal.md). All words are placeholders ([public-is-draft]).

import { useState } from 'react'
import type { PurgeInput } from './purge-actions'

export interface PurgeCandidate {
  groupId: string
  name: string
  removedAt: Date
}

const REASONS: { code: PurgeInput['reasonCode']; label: string }[] = [
  { code: 'illegal_content', label: 'Illegal content' },
  { code: 'person_did_not_agree', label: 'The person in it did not agree' },
  { code: 'not_suitable', label: 'Not suitable' },
  { code: 'other', label: 'Something else' },
]

export function PurgeList({ candidates, onPurge }: { candidates: PurgeCandidate[]; onPurge: (input: PurgeInput) => Promise<void> }) {
  const [asking, setAsking] = useState<string | null>(null)
  const [reason, setReason] = useState<PurgeInput['reasonCode']>('illegal_content')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Set<string>>(new Set())

  if (candidates.length === 0) {
    return (
      <p data-testid="purge-empty" className="text-body-sm text-[var(--color-fg-muted)]">
        No removed photos are waiting to be deleted.
      </p>
    )
  }

  async function confirm(groupId: string) {
    if (busy) return
    if (reason === 'other' && !note.trim()) {
      setError('Add a note saying what happened.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      await onPurge({ groupId, reasonCode: reason, ...(note.trim() ? { reasonNote: note.trim() } : {}) })
      setDone((d) => new Set(d).add(groupId))
      setAsking(null)
      setNote('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]" data-testid="purge-list">
      {candidates.map((c) => (
        <li key={c.groupId} className="space-y-3 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-body font-medium text-[var(--color-fg)]">{c.name}</p>
              <p className="text-caption text-[var(--color-fg-muted)]">Removed {c.removedAt.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' })}</p>
            </div>
            {done.has(c.groupId) ? (
              <span data-testid={`purge-done-${c.groupId}`} className="text-body-sm font-medium text-[var(--color-fg-muted)]">
                Deleted for good
              </span>
            ) : (
              <button
                type="button"
                className="btn-secondary min-h-11"
                onClick={() => {
                  setAsking(c.groupId)
                  setError(null)
                }}
              >
                Delete permanently
              </button>
            )}
          </div>
          {asking === c.groupId && !done.has(c.groupId) && (
            <div data-testid="purge-confirm" className="space-y-3 rounded-md bg-[var(--color-surface)] p-3">
              <p className="text-body-sm text-[var(--color-fg)]">
                This deletes the photo from storage. It can’t be undone, and removing it first can’t bring it back.
              </p>
              <label className="block text-body-sm text-[var(--color-fg)]">
                Why
                <select className="input mt-1" value={reason} onChange={(e) => setReason(e.target.value as PurgeInput['reasonCode'])}>
                  {REASONS.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              {reason === 'other' && (
                <label className="block text-body-sm text-[var(--color-fg)]">
                  Note
                  <input className="input mt-1" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
              )}
              {error && (
                <p role="alert" className="text-body-sm text-[var(--color-danger,#b00)]">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <button type="button" className="btn-primary min-h-11" disabled={busy} onClick={() => confirm(c.groupId)}>
                  Delete for good
                </button>
                <button type="button" className="btn-secondary min-h-11" onClick={() => setAsking(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
