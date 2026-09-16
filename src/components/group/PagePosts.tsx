'use client'

// F072 — what a Page owner says, and where it lands.
//
// Acceptance 1: a member without the managing role gets no control. `canPost`
// comes from the same ownership test the handler runs, so a control that is
// rendered is a control that works.
//
// Acceptance 4: an edit happens in place and the row keeps its id, so an edit
// here replaces the text of the post already on screen rather than adding a
// second one. There is no delete control, and there is no handler behind one.
//
// Acceptance 5: a post renders as coming from the Page. No price, no buy
// control, no listing chrome. It is the Page talking.
//
// COPY. The voice guide rules out writing about this the way a feed does:
// nobody "posts an update" here, they tell people something. Hence "Let people
// know" rather than Post, and no count of anything anywhere.

import { useState } from 'react'
import type { PagePost } from '@/lib/groups/page-posts'
import { formatPostDate } from '@/lib/groups/post-date'

const BODY_LIMIT = 5000
const TRY_AGAIN = "That didn't go through. Mind trying again?"

interface Props {
  groupId: string
  posts: PagePost[]
  canPost: boolean
  onPost: (input: { groupId: string; body: string }) => Promise<
    { ok: true; data: { postId: string; createdAt: string } } | { ok: false; message: string; code: string }
  >
  onEdit: (input: { postId: string; body: string }) => Promise<
    { ok: true; data: { postId: string } } | { ok: false; message: string; code: string }
  >
}

export function PagePosts({ groupId, posts, canPost, onPost, onEdit }: Props) {
  const [items, setItems] = useState<PagePost[]>(posts)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  // A visitor looking at a Page with nothing on it sees no empty section. The
  // owner does, because the owner is the one who can fill it.
  if (!canPost && items.length === 0) return null

  const submit = async () => {
    const body = draft.trim()
    if (!body || busy) return
    setBusy(true)
    setError(null)
    const r = await onPost({ groupId, body })
    setBusy(false)
    if (!r.ok) {
      setError(r.message || TRY_AGAIN)
      return
    }
    setItems([
      { id: r.data.postId, body, createdAt: r.data.createdAt, updatedAt: r.data.createdAt },
      ...items,
    ])
    setDraft('')
  }

  const saveEdit = async (postId: string) => {
    const body = editDraft.trim()
    if (!body || busy) return
    setBusy(true)
    setError(null)
    const r = await onEdit({ postId, body })
    setBusy(false)
    if (!r.ok) {
      setError(r.message || TRY_AGAIN)
      return
    }
    // In place: the id is unchanged, so this rewrites the row already here.
    setItems(items.map((p) => (p.id === postId ? { ...p, body } : p)))
    setEditingId(null)
  }

  return (
    <section className="mt-8" data-testid="page-posts">
      <h2 className="text-lg font-medium">What&apos;s happening</h2>

      {canPost && (
        <div className="mt-3 flex flex-col gap-2">
          <label htmlFor="page-post-body" className="sr-only">
            What do you want people to know?
          </label>
          <textarea
            id="page-post-body"
            data-testid="page-post-body"
            value={draft}
            maxLength={BODY_LIMIT}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="What do you want people to know?"
            className="w-full rounded border border-[var(--color-control-border)] p-3 text-sm"
          />
          <div>
            <button
              type="button"
              data-testid="page-post-send"
              onClick={submit}
              disabled={busy || draft.trim().length === 0}
              className="btn-primary disabled:opacity-50"
            >
              {busy ? 'Sending' : 'Let people know'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" data-testid="page-post-error" className="mt-2 text-sm text-[var(--color-charcoal-900)]">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <div
          data-testid="page-posts-empty"
          className="mt-3 rounded border border-dashed border-gray-300 p-6 text-sm text-gray-500"
        >
          <p>Nothing here yet. Tell people what&apos;s going on.</p>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {items.map((post) => (
            <li key={post.id} data-testid="page-post" className="card p-3">
              {editingId === post.id ? (
                <div className="flex flex-col gap-2">
                  <label htmlFor={`edit-${post.id}`} className="sr-only">
                    Edit what you said
                  </label>
                  <textarea
                    id={`edit-${post.id}`}
                    data-testid="page-post-edit-body"
                    value={editDraft}
                    maxLength={BODY_LIMIT}
                    rows={3}
                    onChange={(e) => setEditDraft(e.target.value)}
                    className="w-full rounded border border-[var(--color-control-border)] p-3 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      data-testid="page-post-edit-save"
                      onClick={() => saveEdit(post.id)}
                      disabled={busy || editDraft.trim().length === 0}
                      className="btn-primary disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      data-testid="page-post-edit-cancel"
                      onClick={() => setEditingId(null)}
                      className="text-sm underline"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="whitespace-pre-wrap text-sm text-[var(--color-charcoal-900)]">{post.body}</p>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="text-xs text-gray-500">{formatPostDate(post.createdAt)}</span>
                    {canPost && (
                      <button
                        type="button"
                        data-testid="page-post-edit"
                        onClick={() => {
                          setEditingId(post.id)
                          setEditDraft(post.body)
                          setError(null)
                        }}
                        className="text-xs underline"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
