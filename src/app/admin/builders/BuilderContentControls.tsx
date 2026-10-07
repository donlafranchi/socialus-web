'use client'

// #388 — one switch and one delete, for all builder content at once. The
// switch answers with an Undo; delete asks once more and has none.

import { useState, useTransition } from 'react'
import type { BuilderContentDeleted } from '@/actions/builder'

interface Props {
  visible: boolean
  pages: number
  posts: number
  onSetVisible: (visible: boolean) => Promise<void>
  onDeleteAll: () => Promise<BuilderContentDeleted>
}

export function BuilderContentControls({ visible, pages, posts, onSetVisible, onDeleteAll }: Props) {
  const [pending, start] = useTransition()
  const [toast, setToast] = useState<{ text: string; undo?: boolean } | null>(null)
  const [confirming, setConfirming] = useState(false)

  const flip = (to: boolean, undo = true) =>
    start(async () => {
      await onSetVisible(to)
      setToast({ text: to ? 'Builder content is showing to members.' : 'Builder content is hidden from members.', undo })
    })

  const del = () =>
    start(async () => {
      const n = await onDeleteAll()
      setConfirming(false)
      setToast({ text: `Deleted ${n.pages} Pages and everything on them, ${n.follows} follows, ${n.memberships} memberships.` })
    })

  return (
    <div className="mt-4 flex flex-col gap-4">
      <section className="card flex flex-col gap-3 p-4" data-testid="builder-switch">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">Builder content visible to members</p>
            <p className="text-sm text-[var(--color-fg-muted)]">
              {pages} Pages, {posts} Posts · {visible ? 'showing' : 'hidden'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={visible}
            data-testid="builder-visible-toggle"
            disabled={pending}
            onClick={() => flip(!visible)}
            className={visible ? 'btn-primary' : 'btn-secondary'}
          >
            {visible ? 'Hide all' : 'Show all'}
          </button>
        </div>
      </section>

      <section className="card flex flex-col gap-3 p-4" data-testid="builder-delete">
        <p className="font-medium">Delete all builder content</p>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Every Page, Post, follow and membership the builder accounts made. Member-made content is never touched.
          Permanent. Photo files are removed by the GitHub workflow.
        </p>
        {confirming ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" data-testid="builder-delete-confirm" disabled={pending} onClick={del} className="btn-primary">
              Yes, delete {pages} Pages permanently
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="btn-secondary">
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            data-testid="builder-delete-start"
            disabled={pending || pages === 0}
            onClick={() => setConfirming(true)}
            className="btn-secondary self-start"
          >
            Delete all
          </button>
        )}
      </section>

      {toast && (
        <div role="status" data-testid="builder-toast" className="card flex items-center justify-between gap-3 p-3 text-sm">
          <span>{toast.text}</span>
          {toast.undo && (
            <button type="button" className="underline" disabled={pending} onClick={() => flip(!visible, false)}>
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  )
}
