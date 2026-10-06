'use client'

// #423 — the PM, 2026-10-06: Page settings, last on the owner's Edit Page.
// Archive hides the Page from everyone but its owner; Delete hides it at once
// and removes it 14 days on, restorable from You until then. Delete sits
// behind one sheet where the Page name is typed exactly (GitHub's delete
// repository; Facebook Pages' delete with 14 days to change your mind).
// The handlers re-check the managing role; this only offers the buttons.
// Copy is a placeholder ([public-is-draft]).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { Field } from '@/components/ui/Field'
import { formatRemovalDate, removalDateFrom } from '@/lib/groups/page-removal'

type Result = { ok: true } | { ok: false; message: string }

export interface PageSettingsProps {
  groupId: string
  pagePath: string
  name: string
  lifecycleState: 'active' | 'archived'
  onArchive: (i: { groupId: string; pagePath: string }) => Promise<Result>
  onRestore: (i: { groupId: string }) => Promise<Result>
  onDelete: (i: { groupId: string; pagePath: string; confirmName: string }) => Promise<Result>
  now?: () => Date
}

export function PageSettings({ groupId, pagePath, name, lifecycleState, onArchive, onRestore, onDelete, now = () => new Date() }: PageSettingsProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const archived = lifecycleState === 'archived'

  async function toggleArchive() {
    setBusy(true)
    setError(null)
    const r = archived ? await onRestore({ groupId }) : await onArchive({ groupId, pagePath })
    setBusy(false)
    if (!r.ok) return setError(r.message)
    router.refresh()
  }

  async function confirmDelete() {
    setBusy(true)
    setDeleteError(null)
    const r = await onDelete({ groupId, pagePath, confirmName: typed })
    if (!r.ok) {
      setBusy(false)
      return setDeleteError(r.message)
    }
    router.push('/you')
  }

  return (
    <details data-testid="page-settings" className="group">
      <summary className="press flex min-h-tap cursor-pointer list-none items-center justify-between gap-3 text-title-3 text-[var(--color-fg)] [&::-webkit-details-marker]:hidden">
        Page settings
        <ChevronDown size={20} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-2 flex flex-col gap-3">
        <section data-testid="page-settings-archive" aria-label={archived ? 'Archived' : 'Archive'} className="card p-4">
          <h3 className="text-body-sm font-semibold text-[var(--color-fg)]">{archived ? 'Archived' : 'Archive'}</h3>
          <p className="mt-1 text-body-sm text-[var(--color-fg-muted)]">
            {archived
              ? 'Only you can see this Page. Restore it to show it to everyone again.'
              : 'Hide this Page from everyone but you. Restore it any time from You.'}
          </p>
          {error && (
            <p role="alert" className="mt-2 text-caption text-red-700">
              {error}
            </p>
          )}
          <Button variant="secondary" size="sm" className="mt-3" disabled={busy} onClick={toggleArchive}>
            {archived ? 'Restore' : 'Archive'}
          </Button>
        </section>

        <section data-testid="page-settings-delete" aria-label="Delete" className="card p-4">
          <h3 className="text-body-sm font-semibold text-[var(--color-fg)]">Delete</h3>
          <p className="mt-1 text-body-sm text-[var(--color-fg-muted)]">
            Remove this Page and its posts. You can restore it from You for 14 days.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3 text-red-700"
            disabled={busy}
            onClick={() => {
              setTyped('')
              setDeleteError(null)
              setSheetOpen(true)
            }}
          >
            Delete Page
          </Button>
        </section>
      </div>

      <Sheet
        open={sheetOpen}
        title="Delete this Page?"
        onClose={() => setSheetOpen(false)}
        testId="delete-page-sheet"
        description={`${name} and its posts disappear for everyone right away. You can restore it from You until ${formatRemovalDate(removalDateFrom(now()))}. After that, it's gone for good.`}
        footer={
          <Button
            variant="danger"
            className="w-full"
            data-testid="delete-page-confirm"
            disabled={busy || typed !== name}
            onClick={confirmDelete}
          >
            Delete Page
          </Button>
        }
      >
        <Field label={`Type ${name} to confirm`} error={deleteError}>
          {(p) => (
            <input
              {...p}
              className="input"
              data-testid="delete-page-name"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          )}
        </Field>
      </Sheet>
    </details>
  )
}
