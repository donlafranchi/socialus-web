'use client'

// F078 criterion 3 and F102 criteria 1–4 — what the poster is told when
// something of theirs is hidden, and the one answer they get: fix it and repost
// (a post only), or say the report is wrong. In-app only, never email. Copy is a
// placeholder ([public-is-draft]), kind and gracious (F078 criterion 11).

import { useState } from 'react'
import Link from 'next/link'
import { canonicalPagePath } from '@/lib/groups/page-handle'

export interface Notice {
  id: string
  message: string
  createdAt: string
  subjectKind: 'group' | 'post'
  /** The Page's address id (not its row id), where "Fix it" leads. */
  pageHandle: string | null
  /** What the poster did about it, if anything. */
  answer: 'fix_and_repost' | 'wrong' | null
  /** An unanswered hide closes itself after 14 days. */
  closed: boolean
}

export type Answer = { noticeId: string; reason: 'mistaken' | 'malicious' | 'misusing_reports'; note: string }

const REASONS: { value: Answer['reason']; label: string }[] = [
  { value: 'mistaken', label: 'Mistaken' },
  { value: 'malicious', label: 'Malicious' },
  { value: 'misusing_reports', label: 'Misusing reports' },
]

export function YouNotices({ notices, onAnswer }: { notices: Notice[]; onAnswer?: (a: Answer) => Promise<void> }) {
  if (notices.length === 0) return null
  return (
    <section className="mt-8" data-testid="you-notices">
      <h2 className="mb-3 text-title-3 text-[var(--color-fg)]">Notices</h2>
      <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
        {notices.map((n) => (
          <NoticeRow key={n.id} notice={n} onAnswer={onAnswer} />
        ))}
      </ul>
    </section>
  )
}

function NoticeRow({ notice: n, onAnswer }: { notice: Notice; onAnswer?: (a: Answer) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<Answer['reason'] | null>(null)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const answer = sent ? 'wrong' : n.answer
  const canAnswer = !answer && !n.closed && !!onAnswer

  const send = async () => {
    if (!reason || !note.trim() || !onAnswer) return
    setSending(true)
    setError(null)
    try {
      await onAnswer({ noticeId: n.id, reason, note: note.trim() })
      setSent(true)
    } catch {
      setError("That didn't go through. Please try again.")
    } finally {
      setSending(false)
    }
  }

  return (
    <li className="px-4 py-3">
      <p className="break-words text-body-sm text-[var(--color-fg)]">{n.message}</p>
      <p className="mt-1 text-caption text-[var(--color-fg-muted)]">
        {new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </p>

      {answer && (
        <p data-testid="notice-answered" className="mt-2 text-body-sm text-[var(--color-fg-muted)]">
          {answer === 'fix_and_repost'
            ? "Thanks for fixing it. It's showing again."
            : "We've got your answer. It stays hidden until a person has had a look."}
        </p>
      )}
      {!answer && n.closed && (
        <p data-testid="notice-closed" className="mt-2 text-body-sm text-[var(--color-fg-muted)]">
          This one has closed. Nothing more is needed from you.
        </p>
      )}

      {canAnswer && !open && (
        <div className="mt-2 flex flex-wrap gap-2">
          {n.subjectKind === 'post' && n.pageHandle && (
            <Link href={canonicalPagePath(n.pageHandle)} className="btn-secondary inline-flex min-h-tap items-center">
              Fix it
            </Link>
          )}
          <button type="button" className="btn-secondary min-h-tap" onClick={() => setOpen(true)}>
            Say it&rsquo;s a mistake
          </button>
        </div>
      )}

      {canAnswer && open && (
        <div className="mt-3 flex flex-col gap-2">
          <fieldset>
            <legend className="text-body-sm font-medium text-[var(--color-fg)]">What best fits?</legend>
            {REASONS.map((r) => (
              <label key={r.value} className="flex min-h-11 items-center gap-3 text-body-sm text-[var(--color-fg)]">
                <input
                  type="radio"
                  name={`reason-${n.id}`}
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="h-4 w-4 shrink-0"
                />
                {r.label}
              </label>
            ))}
          </fieldset>
          <label className="text-body-sm font-medium text-[var(--color-fg)]" htmlFor={`note-${n.id}`}>
            Tell us what happened
          </label>
          <textarea
            id={`note-${n.id}`}
            maxLength={280}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded border border-[var(--color-control-border)] p-3 text-body-sm"
          />
          {error && (
            <p role="alert" className="text-body-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}
          <button type="button" className="btn-primary min-h-tap" disabled={!reason || !note.trim() || sending} onClick={send}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      )}
    </li>
  )
}
