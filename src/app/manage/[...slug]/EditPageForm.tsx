'use client'

// The owner's edit form.
//
// Same fields they set at creation, minus the ones a live Page cannot change.
// The ADDRESS is shown and not editable, with the reason said out loud rather
// than the field being silently absent: a Page's URL has been shared and moving
// it breaks every link somebody already sent.
//
// A FAILED SAVE SAYS WHY. The handler's messages are written for the owner, so
// they are shown verbatim instead of being replaced by "something went wrong" —
// Don hit exactly that and could not tell whether it was his input or ours.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SocialLinksFields } from '@/components/group/SocialLinksFields'
import type { SocialLinks } from '@/lib/groups/social-links'
import type { EditPageInput } from './actions'

export function EditPageForm({
  groupId,
  kind,
  pagePath,
  slug,
  initialName,
  initialDescription,
  initialSocialLinks,
  onSave,
}: {
  groupId: string
  kind: string
  pagePath: string
  slug: string
  initialName: string
  initialDescription: string
  initialSocialLinks: SocialLinks
  onSave: (input: EditPageInput) => Promise<{ ok: true }>
}) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [socialLinks, setSocialLinks] = useState<SocialLinks>(initialSocialLinks)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        await onSave({ groupId, pagePath, name, description, socialLinks })
        setSaved(true)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'That did not save.')
      }
    })
  }

  return (
    <form onSubmit={submit} data-testid="edit-page-form" className="flex flex-col gap-4">
      <label className="block">
        <span className="text-sm font-medium text-[var(--color-fg)]">Name</span>
        <input
          className="input mt-1 w-full"
          data-testid="edit-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          required
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-[var(--color-fg)]">Description</span>
        <textarea
          className="input mt-1 w-full"
          data-testid="edit-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          rows={5}
        />
      </label>

      {/* Shown, not hidden, and the reason given. A field that quietly is not
          there reads as a missing feature. */}
      <div data-testid="edit-address-frozen">
        <span className="text-sm font-medium text-[var(--color-fg)]">Address</span>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          socialus.org{pagePath}
        </p>
        <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
          The name can change; the address can&rsquo;t. People have this link already, and moving
          it would break it. <span className="sr-only">Current address: {slug}</span>
        </p>
      </div>

      <SocialLinksFields kind={kind} value={socialLinks} onChange={setSocialLinks} />

      {error ? (
        <p role="alert" data-testid="edit-error" className="text-sm text-[var(--color-fg)]">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" data-testid="edit-saved" className="text-sm text-[var(--color-fg)]">
          Saved.
        </p>
      ) : null}

      <div className="flex gap-2">
        <button type="submit" disabled={pending} data-testid="edit-save" className="btn-primary w-full disabled:opacity-50">
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        <a href={pagePath} className="btn-secondary w-full text-center">
          Done
        </a>
      </div>
    </form>
  )
}
