'use client'

// #1094 — the one ➕. A floating round button, bottom right, that opens a sheet:
// Post, Event, Page, Wonder. The dock is a row, not a lone button, so the chat-first
// prompt box can sit to its left (flex-1) without moving the ➕.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useNavVisible } from '@/components/NavVisibilityProvider'
import { navHidden } from '@/components/shell/nav-hidden'
import { Sheet } from '@/components/ui/Sheet'
import { getOwnPages } from '@/lib/member/own-pages'
import { composerHref, createChoices, type CreateKind, type CreatePage } from '@/lib/create/create-targets'

const ROW = 'press flex min-h-14 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-body font-medium text-[var(--color-fg)] hover:bg-neutral-100'
const HINT = {
  post: 'Share an update with the people who follow a Page',
  event: 'A post with a date and a place',
  page: 'Start a new Page',
  wonder: 'See if enough people want something before you make it',
} as const

export function CreateDock() {
  const pathname = usePathname()
  const { user } = useAuth()
  const visible = useNavVisible()
  const [open, setOpen] = useState(false)
  const [pages, setPages] = useState<CreatePage[]>([])
  const [which, setWhich] = useState<Exclude<CreateKind, 'page'> | null>(null)
  const opener = useRef<HTMLButtonElement>(null)

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

  if (navHidden(pathname)) return null

  const close = () => {
    setOpen(false)
    setWhich(null)
  }
  const choices = createChoices({ signedIn: !!user, pages })
  const noPage = !!user && choices.some((c) => c.needsPage)

  return (
    <>
      <div
        data-testid="create-dock"
        data-visible={visible ? 'true' : 'false'}
        className={`pointer-events-none fixed inset-x-0 bottom-0 z-40 flex items-end justify-end gap-3 px-4 pb-[var(--float-offset)] transition-transform duration-200 ease-out motion-reduce:transition-none ${
          visible ? 'translate-y-0' : 'translate-y-[calc(100%+var(--float-offset))]'
        }`}
      >
        {/* The prompt box goes here, flex-1, left of the ➕. */}
        <button
          ref={opener}
          type="button"
          data-testid="create-fab"
          aria-label="Create"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="press pointer-events-auto inline-flex size-[var(--dock-size)] shrink-0 items-center justify-center rounded-full bg-[var(--color-charcoal-900)] text-white shadow-overlay focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Plus size={26} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <Sheet
        open={open}
        onClose={close}
        testId="create-sheet"
        title={which ? 'Which Page?' : 'Create'}
        returnFocusTo={opener}
        description={noPage ? 'Posts, events and wonders live on a Page. Start one first.' : undefined}
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
                      <span className="block text-caption font-normal text-[var(--color-fg-muted)]">{HINT[c.id]}</span>
                    </span>
                    <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-[var(--color-fg-muted)]" />
                  </Link>
                ) : (
                  <button
                    type="button"
                    data-testid={`create-${c.id}`}
                    onClick={() => setWhich(c.id as Exclude<CreateKind, 'page'>)}
                    className={ROW}
                  >
                    <span>
                      {c.label}
                      <span className="block text-caption font-normal text-[var(--color-fg-muted)]">{HINT[c.id]}</span>
                    </span>
                    <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-[var(--color-fg-muted)]" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </>
  )
}
