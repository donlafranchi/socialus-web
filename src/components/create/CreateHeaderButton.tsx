'use client'

// #1094 — the ➕ for large screens: top right of the header, above the search row, signed in only.
// On a phone, Create lives in the bar's ⋯ menu (MobileBar). #1141.

import { useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Plus } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { navHidden } from '@/components/shell/nav-hidden'
import { CreateSheet } from './CreateSheet'

export function CreateHeaderButton() {
  const pathname = usePathname()
  const { user, loading } = useAuth()
  const [open, setOpen] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)

  if (navHidden(pathname) || loading || !user) return null

  return (
    <>
      <button
        ref={opener}
        type="button"
        data-testid="create-header"
        aria-label="Create"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="press hidden size-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-charcoal-900)] text-white md:inline-flex focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Plus size={20} strokeWidth={2} aria-hidden="true" />
      </button>
      <CreateSheet open={open} onClose={() => setOpen(false)} returnFocusTo={opener} />
    </>
  )
}
