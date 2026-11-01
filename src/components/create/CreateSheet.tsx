'use client'

// #1094 — the create sheet: the post kinds, then Page. Only for someone signed in.
// #1141 — opened by the ➕ in the header from 744px up, and by Create in the phone bar's ⋯ menu.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Sheet } from '@/components/ui/Sheet'
import { getOwnPages } from '@/lib/member/own-pages'
import type { PostKind } from '@/lib/posts/kinds'
import { composerHref, createChoices, type CreatePage } from '@/lib/create/create-targets'

const ROW = 'press flex min-h-14 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-body font-medium text-[var(--color-fg)] hover:bg-neutral-100'

export function CreateSheet({
  open,
  onClose,
  returnFocusTo,
}: {
  open: boolean
  onClose: () => void
  returnFocusTo?: React.RefObject<HTMLElement | null>
}) {
  const { user } = useAuth()
  const [pages, setPages] = useState<CreatePage[]>([])
  const [which, setWhich] = useState<PostKind | null>(null)

  useEffect(() => {
    if (!open || !user) return
    let live = true
    getOwnPages(createClient(), user.id).then((own) => {
      if (live) setPages(own.filter((p) => p.lifecycleState === 'active' && p.href).map((p) => ({ name: p.name, href: p.href! })))
    })
    return () => {
      live = false
    }
  }, [open, user])

  const close = () => {
    onClose()
    setWhich(null)
  }
  const choices = createChoices({ signedIn: !!user, pages })
  const noPage = !!user && choices.some((c) => c.needsPage)

  return (
  <Sheet
    open={open}
    onClose={close}
    testId="create-sheet"
    title={which ? 'Which Page?' : 'Create'}
    returnFocusTo={returnFocusTo}
    description={noPage ? 'Posts, events and proposals live on a Page. Start one first.' : undefined}
  >
    {which ? (
      <ul className="flex flex-col gap-1">
        {pages.map((p) => (
          <li key={p.href}>
            <Link href={composerHref(p, which)} onClick={close} className={ROW}>
              {p.name}
            </Link>
          </li>
        ))}
      </ul>
    ) : (
      <ul className="flex flex-col gap-1 pb-[env(safe-area-inset-bottom)]" aria-label="What do you want to create?">
        {choices.map((c) => (
          <li key={c.id}>
            {c.href ? (
              <Link href={c.href} onClick={close} data-testid={`create-${c.id}`} className={ROW}>
                <span>
                  {c.label}
                  <span className="block text-caption font-normal text-[var(--color-fg-muted)]">{c.hint}</span>
                </span>
                <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-[var(--color-fg-muted)]" />
              </Link>
            ) : (
              <button
                type="button"
                data-testid={`create-${c.id}`}
                onClick={() => setWhich(c.id as PostKind)}
                className={ROW}
              >
                <span>
                  {c.label}
                  <span className="block text-caption font-normal text-[var(--color-fg-muted)]">{c.hint}</span>
                </span>
                <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-[var(--color-fg-muted)]" />
              </button>
            )}
          </li>
        ))}
      </ul>
    )}
  </Sheet>
  )
}
