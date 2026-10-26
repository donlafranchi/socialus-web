'use client'

// F118 criterion 1 — find your town by its name, a town inside it, or a zip.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { matchTown, type TownRow } from '@/lib/open/towns'
import { townForZipAction } from '@/app/_actions/open-actions'
import { buttonClass } from '@/components/ui/Button'

export function TownFinder({ towns }: { towns: TownRow[] }) {
  const router = useRouter()
  const [typed, setTyped] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function find(e: React.FormEvent) {
    e.preventDefault()
    setNote(null)
    const q = typed.trim()
    if (/^\d{5}$/.test(q)) {
      setBusy(true)
      const r = await townForZipAction(q)
      setBusy(false)
      if (r.kind === 'town') return router.push(`/open/${r.slug}`)
      if (r.kind === 'open') return setNote('SocialUs is already open there. Come on in.')
      if (r.kind === 'elsewhere') return setNote('That zip isn’t on this list yet. Sign up and we’ll tell you when it opens.')
      return setNote('We don’t recognize that zip, try again.')
    }
    const t = matchTown(towns, q)
    if (t) return router.push(`/open/${t.slug}`)
    setNote('No town by that name on the list. Try your zip.')
  }

  return (
    <form onSubmit={find} className="mt-4" data-testid="town-finder">
      <label htmlFor="town-q" className="text-body-sm font-medium text-[var(--color-fg)]">Your town or zip</label>
      <div className="mt-1.5 flex gap-2">
        <input
          id="town-q"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="address-level2"
          className="min-w-0 flex-1 rounded-md border border-[var(--color-control-border)] bg-[var(--color-bg)] px-3 py-2.5 text-body"
        />
        <button type="submit" disabled={busy || !typed.trim()} className={buttonClass('primary', 'md')}>Find</button>
      </div>
      {note && (
        <p className="mt-2 text-body-sm text-[var(--color-fg-muted)]" role="status">
          {note}
          {note.startsWith('That zip') && <> <a href="/auth/login?next=/open" className="text-[var(--color-accent-text)] underline">Sign up</a></>}
          {note.startsWith('SocialUs is already') && <> <a href="/explore" className="text-[var(--color-accent-text)] underline">See what’s on</a></>}
        </p>
      )}
    </form>
  )
}
