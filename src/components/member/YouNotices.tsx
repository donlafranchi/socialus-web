'use client'

// F078 criterion 3, F102 criteria 1–4 and #626 — what the owner is told when something
// of theirs is reported: a courtesy notice the first time (it stays up), a hide the
// second time. One answer, one button, "This is a mistake". Fix it leads to the Page
// (a post only). In-app only, never email. Copy is the PM's ([public-is-draft]).

import { useState } from 'react'
import Link from 'next/link'
import { canonicalPagePath } from '@/lib/groups/page-handle'

export interface Notice {
  id: string
  message: string
  createdAt: string
  /** A courtesy notice leaves the content up; a hide takes it down. */
  kind: 'content_hidden' | 'courtesy'
  subjectKind: 'group' | 'post' | 'page_picture' | 'post_photo' | 'page_words' | 'page_item'
  /** The Page's address id (not its row id), where "Fix it" leads. */
  pageHandle: string | null
  /** What the owner did about it, if anything. */
  answer: 'fix_and_repost' | 'wrong' | 'mistake' | null
  /** An unanswered notice closes itself after 14 days. */
  closed: boolean
}

export type Answer = { noticeId: string }

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
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const answer = sent ? 'mistake' : n.answer
  const canAnswer = !answer && !n.closed && !!onAnswer

  const send = async () => {
    if (!onAnswer) return
    setSending(true)
    setError(null)
    try {
      await onAnswer({ noticeId: n.id })
      setSent(true)
    } catch {
      setError("That didn't go through. Mind trying again?")
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
            : n.kind === 'courtesy'
              ? "Thanks, we've noted it. If it's reported again, it goes to the top of our review list."
              : "Thanks, it's at the top of our review list. It stays hidden until a person from our team has had a look."}
        </p>
      )}
      {!answer && n.closed && (
        <p data-testid="notice-closed" className="mt-2 text-body-sm text-[var(--color-fg-muted)]">
          This one&rsquo;s closed. Nothing more needed from you.
        </p>
      )}

      {canAnswer && (
        <div className="mt-2 flex flex-wrap gap-2">
          {n.subjectKind === 'post' && n.pageHandle && (
            <Link href={canonicalPagePath(n.pageHandle)} className="btn-secondary inline-flex min-h-tap items-center">
              Fix it
            </Link>
          )}
          <button type="button" className="btn-secondary min-h-tap" disabled={sending} onClick={send}>
            This is a mistake
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-body-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </li>
  )
}
