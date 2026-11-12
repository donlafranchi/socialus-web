'use client'

// #1183 — one post from a member. Signed with display name, avatar and neighborhood; the name opens nothing. No
// comments: one answer ("I'm interested" / "I saw it"), and only the poster sees who answered, by display name.
// Reportable on the courtesy-first path. Its poster can take it down. Draft words.

import { useSignInFirst } from '@/hooks/useSignInFirst'
import { COPY } from '@/lib/copy'
import { useState } from 'react'
import { PersonMark } from '@/components/PersonMark'
import { Button } from '@/components/ui/Button'
import { ReportControl } from '@/components/group/ReportControl'
import { ANSWER_LABEL } from '@/lib/member-posts/kinds'
import { memberPostLead, saleDay } from '@/lib/member-posts/lead'
import type { MemberPost } from '@/lib/member-posts/read'
import type { ReportCategory } from '@/lib/reports/categories'

type Done<T = object> = ({ ok: true } & T) | { ok: false; message?: string }

export function MemberPostView({
  post,
  now = new Date(),
  loggedIn = true,
  onAnswer,
  onWithdraw,
  onReport,
}: {
  post: MemberPost
  now?: Date
  /** F134 — a visitor reads the post; answering asks for sign-in first. */
  loggedIn?: boolean
  onAnswer: (on: boolean) => Promise<Done<{ on: boolean }>>
  onWithdraw: () => Promise<Done>
  onReport: (input: { subjectId: string; subjectKind?: string; category: ReportCategory; body: string }) => Promise<{ ok: true } | { ok: false; message: string }>
}) {
  const [answered, setAnswered] = useState(post.answered)
  const [ended, setEnded] = useState(post.ended)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async (on: boolean) => {
    setBusy(true)
    setError(null)
    const r = await onAnswer(on).catch(() => ({ ok: false as const }))
    if (r.ok) setAnswered(r.on)
    else setError('That didn’t go through. Try again?')
    setBusy(false)
  }
  // F134.4 — signed out, the answer asks for sign-in first; back signed in, it is sent.
  const gate = useSignInFirst({ action: 'respond', target: post.id, signedIn: loggedIn, onReturn: () => void (answered || send(true)) })
  const answer = () => gate.ask(() => void send(!answered))
  const withdraw = async () => {
    setBusy(true)
    setError(null)
    const r = await onWithdraw().catch(() => ({ ok: false as const }))
    if (r.ok) setEnded(true)
    else setError('That didn’t go through. Try again?')
    setBusy(false)
  }

  return (
    <article data-testid="member-post" className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <p data-testid="member-post-lead" className="text-micro font-semibold uppercase tracking-wider text-[var(--color-fg)]">
          {memberPostLead(post, now)}
        </p>
        {!post.mine && !ended && (
          <ReportControl subjectId={post.id} subjectKind="member_post" subjectLabel="this post" itemLabel="Report this post" loggedIn={loggedIn} onSend={onReport} />
        )}
      </div>
      <p className="whitespace-pre-line text-body text-[var(--color-fg)]">{post.body}</p>
      {post.saleOn && (
        <p data-testid="member-post-sale" className="text-body-sm text-[var(--color-fg)]">
          {saleDay(post.saleOn)}
          {post.street ? ` · ${post.street}` : ''}
        </p>
      )}
      {post.labels.length > 0 && (
        <p data-testid="member-post-labels" className="text-body-sm text-[var(--color-fg-muted)]">
          Listed under {post.labels.join(' · ')}
        </p>
      )}
      <p className="flex items-center gap-2 text-body-sm">
        <PersonMark name={post.displayName ?? COPY.aNeighbor} photoUrl={post.avatarUrl} className="size-8 text-caption" />
        <span data-testid="member-post-name" className="font-medium text-[var(--color-fg)]">{post.displayName ?? COPY.aNeighbor}</span>
        <span className="text-[var(--color-fg-muted)]">in {post.placeName}</span>
      </p>

      {post.mine ? (
        <section data-testid="member-post-mine" className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-4">
          <h2 className="text-body font-semibold text-[var(--color-fg)]">{ANSWER_LABEL[post.kind]}</h2>
          {post.answers && post.answers.length > 0 ? (
            <ul data-testid="member-post-answers" className="flex flex-col gap-1 text-body-sm text-[var(--color-fg)]">
              {post.answers.map((a) => (
                <li key={`${a.displayName}-${a.at}`}>{a.displayName}</li>
              ))}
            </ul>
          ) : (
            <p className="text-body-sm text-[var(--color-fg-muted)]">No one yet.</p>
          )}
          {ended ? (
            <p data-testid="member-post-ended" className="text-body-sm text-[var(--color-fg-muted)]">
              This post is down. Only you can see it.
            </p>
          ) : (
            <Button variant="secondary" onClick={withdraw} disabled={busy} data-testid="member-post-withdraw" className="self-start">
              Take it down
            </Button>
          )}
        </section>
      ) : ended ? (
        <p data-testid="member-post-ended" className="text-body-sm text-[var(--color-fg-muted)]">This post is down.</p>
      ) : (
        <Button
          variant={answered ? 'secondary' : 'primary'}
          onClick={answer}
          disabled={busy}
          aria-pressed={answered}
          data-testid="member-post-answer"
          className="self-start"
        >
          {ANSWER_LABEL[post.kind]}
        </Button>
      )}
      {gate.sheet}
      {error && (
        <p role="alert" className="text-body-sm text-[var(--color-danger,#b00)]">
          {error}
        </p>
      )}
    </article>
  )
}
