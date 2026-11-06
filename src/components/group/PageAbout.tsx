'use client'

// plan #230 (Don, 10-31) — a Page's business info: a right column on a laptop, and on a phone a sheet
// behind a quiet About in the header (Facebook Page's About). One copy of the info, shown two ways.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'

const AboutOpen = createContext<{ open: boolean; setOpen: (v: boolean) => void }>({ open: false, setOpen: () => {} })

export function PageAboutProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [open])
  return <AboutOpen.Provider value={{ open, setOpen }}>{children}</AboutOpen.Provider>
}

export function PageAboutLink() {
  const { setOpen } = useContext(AboutOpen)
  return (
    <button type="button" data-testid="page-about-open" onClick={() => setOpen(true)} className="press inline-flex min-h-tap items-center px-2 text-body-sm font-semibold text-[var(--color-fg-muted)] underline lg:hidden">
      About
    </button>
  )
}

export function PageAboutAside({ name, children }: { name: string; children: ReactNode }) {
  const { open, setOpen } = useContext(AboutOpen)
  return (
    <>
      {open && <div aria-hidden="true" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/40 lg:hidden" />}
      <aside
        data-testid="page-about-aside"
        aria-label={`About ${name}`}
        {...(open ? { role: 'dialog', 'aria-modal': true } : {})}
        className={
          open
            ? 'fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col gap-4 overflow-y-auto rounded-t-xl bg-[var(--color-bg)] p-4 pb-8 lg:static lg:z-auto lg:max-h-none lg:overflow-visible lg:rounded-none lg:bg-transparent lg:p-0'
            : 'hidden flex-col gap-4 lg:flex'
        }
      >
        {open && (
          <div className="flex items-center justify-between lg:hidden">
            <h2 className="text-title-3 text-[var(--color-fg)]">About</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="press inline-flex size-tap items-center justify-center">
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        )}
        {children}
      </aside>
    </>
  )
}
