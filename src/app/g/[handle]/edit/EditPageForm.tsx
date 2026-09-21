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
import { SocialHandleFields } from '@/components/group/SocialHandleFields'
import { PagePhotoPicker } from '@/components/media/PagePhotoPicker'
import { handlesFromLinks, linksFromHandles } from '@/lib/groups/social-handles'
import type { SocialLinks, SocialPlatform } from '@/lib/groups/social-links'
import type { EditPageInput } from './actions'

export function EditPageForm({
  groupId,
  memberId,
  pagePath,
  slug,
  initialName,
  initialDescription,
  initialPhotoUrl,
  initialSocialLinks,
  onSave,
}: {
  groupId: string
  memberId: string
  pagePath: string
  slug: string
  initialName: string
  initialDescription: string
  initialPhotoUrl: string | null
  initialSocialLinks: SocialLinks
  onSave: (input: EditPageInput) => Promise<{ ok: true }>
}) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  // Handles in the form, URLs on the wire. The member types `donlafranchi`;
  // the column and every read path still get an https URL.
  const [handles, setHandles] = useState<Partial<Record<SocialPlatform, string>>>(() =>
    handlesFromLinks(initialSocialLinks),
  )
  const [photoUrl, setPhotoUrl] = useState<string | null>(initialPhotoUrl)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaved(false)
    startTransition(async () => {
      // Compose the URLs here so a bad handle is caught with the field that
      // caused it, rather than as one opaque failure after a round trip.
      const { links, problems } = linksFromHandles(handles)
      const firstBad = Object.entries(problems)[0]
      if (firstBad) {
        setError(`${firstBad[0]}: ${firstBad[1]}`)
        return
      }
      try {
        await onSave({ groupId, pagePath, name, description, photoUrl, socialLinks: links })
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

      <div>
        <span className="text-sm font-medium text-[var(--color-fg)]">Photo</span>
        <div className="mt-1">
          <PagePhotoPicker memberId={memberId} value={photoUrl} onChange={setPhotoUrl} />
        </div>
      </div>

      <SocialHandleFields value={handles} onChange={setHandles} />

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
