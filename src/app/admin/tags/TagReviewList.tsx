'use client'

// #287 — tags waiting for the operator's call, oldest first. Safe keeps one
// showing; unsafe hides it everywhere and keeps its rows, so either call can
// be made again the other way.

import { useState } from 'react'

export interface WaitingTag {
  id: string
  label: string
  pages: number
  posts: number
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function TagReviewList({
  tags,
  onReview,
}: {
  tags: WaitingTag[]
  onReview: (input: { tagId: string; verdict: 'safe' | 'unsafe' }) => Promise<void>
}) {
  const [waiting, setWaiting] = useState(tags)
  const [error, setError] = useState<string | null>(null)

  const review = async (tagId: string, verdict: 'safe' | 'unsafe') => {
    setError(null)
    try {
      await onReview({ tagId, verdict })
      setWaiting((w) => w.filter((t) => t.id !== tagId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not save. Try again?')
    }
  }

  if (waiting.length === 0) {
    return (
      <p data-testid="tag-review-empty" className="text-sm text-[var(--color-fg-muted)]">
        No tags are waiting.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-[var(--color-fg)]">
          {error}
        </p>
      )}
      <ul className="space-y-2">
        {waiting.map((t) => (
          <li
            key={t.id}
            data-testid="tag-review-row"
            className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--color-fg)]">{t.label}</p>
              <p className="text-xs text-[var(--color-fg-muted)]">
                {plural(t.pages, 'Page')} · {plural(t.posts, 'post')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => review(t.id, 'safe')}
              className="press min-h-11 rounded-full border border-[var(--color-border)] px-4 text-sm"
            >
              Safe
            </button>
            <button
              type="button"
              onClick={() => review(t.id, 'unsafe')}
              className="press min-h-11 rounded-full bg-[var(--color-charcoal-700)] px-4 text-sm text-white"
            >
              Unsafe
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
