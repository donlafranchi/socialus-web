'use client'

// The owner's edit form.
//
// Same fields they set at creation, minus the ones a live Page cannot change.
//
// THE ADDRESS AND THE LINK ARE DIFFERENT THINGS, and this form used to call
// them both "Address" (#180). What it showed under that heading was the URL,
// frozen, with a reason about broken links — so an owner reading it was told
// they could not move house. The link is still frozen and the reason still
// holds; the ADDRESS is where the Page is, and it is editable now.
//
// The picker is `<LocationPlaceFields>`, the same control creation uses. One
// component so the two cannot drift, which is the rule T142 set for it.
//
// A FAILED SAVE SAYS WHY. The handler's messages are written for the owner, so
// they are shown verbatim instead of being replaced by "something went wrong" —
// Don hit exactly that and could not tell whether it was his input or ours.

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SocialHandleFields } from '@/components/group/SocialHandleFields'
import { PagePhotoPicker } from '@/components/media/PagePhotoPicker'
import {
  LocationPlaceFields,
  initialLocationPlaceFieldsState,
  isLocationPlaceFieldsComplete,
  type LocationPlaceFieldsState,
} from '@/components/locations/LocationPlaceFields'
import { createLocationAction } from '@/app/_actions/location-actions'
import { handlesFromLinks, linksFromHandles } from '@/lib/groups/social-handles'
import type { SocialLinks, SocialPlatform } from '@/lib/groups/social-links'
import type { EditPageInput, EditPageResult } from './actions'
import { PostingSafetyNote } from '@/components/PostingSafetyNote'
import { HoursEditor } from '@/components/group/HoursEditor'
import { formatUsPhone } from '@/lib/phone'
import type { OpeningHours } from '@/lib/groups/opening-hours'
import type { PageContact } from '@/lib/groups/page-contact'
import { TagInput, type TagInputValue } from '@/components/tags/TagInput'
import { isValidTagLabel } from '@/lib/groups/tags'

type CreateLocation = typeof createLocationAction

export function EditPageForm({
  groupId,
  memberId,
  pagePath,
  slug,
  initialName,
  initialDescription,
  initialPhotoUrl,
  initialSocialLinks,
  initialAddressLabel,
  initialContact = { phone: null, hours: null },
  contactOn = true,
  initialTags = [],
  onSave,
  onCreateLocation = createLocationAction,
}: {
  groupId: string
  memberId: string
  pagePath: string
  slug: string
  initialName: string
  initialDescription: string
  initialPhotoUrl: string | null
  initialSocialLinks: SocialLinks
  /** Where the Page is now, in the words it was saved with. Null when the
   *  owner never chose one — a different fact from "online", and saying
   *  online would be a claim they never made. */
  initialAddressLabel: string | null
  /** #293 — the Page's business phone and opening hours. */
  initialContact?: PageContact
  /** Don, 2026-10-04 — hours and phone are a component: on for shops and
   *  services, off for a group until its owner adds them. */
  contactOn?: boolean
  /** #285 — editable any time (Don, 2026-10-01). */
  initialTags?: string[]
  onSave: (input: EditPageInput) => Promise<EditPageResult>
  /** Injected so the form can be tested without a server action. */
  onCreateLocation?: CreateLocation
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
  const [showContact, setShowContact] = useState(contactOn)
  const [phone, setPhone] = useState(initialContact.phone ? formatUsPhone(initialContact.phone) : '')
  const [hours, setHours] = useState<OpeningHours | null>(initialContact.hours)
  const [tags, setTags] = useState<TagInputValue>({ tags: initialTags, draft: '' })
  // Closed until asked for. An address the owner is not changing should not
  // look like one they have to re-enter.
  const [changingAddress, setChangingAddress] = useState(false)
  const [place, setPlace] = useState<LocationPlaceFieldsState>(initialLocationPlaceFieldsState)
  const [error, setError] = useState<string | null>(null)
  // #276 — what was last saved, so Done and leaving the page can tell a
  // change from none. Moves on every successful save.
  const current = JSON.stringify({ name, description, handles, photoUrl, phone, hours, tags: tags.tags })
  const [savedState, setSavedState] = useState(current)
  const unsaved = current !== savedState || changingAddress
  const [askingToLeave, setAskingToLeave] = useState(false)
  useEffect(() => {
    if (!unsaved) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])
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
      // The address, when one was actually chosen. A Location is made first
      // and the Page is pointed at it second — and if the first half fails the
      // second never runs. Half a move leaves a Page pointing at nothing,
      // which is a Page with no address at all.
      const tagSet = [...tags.tags, tags.draft].filter(isValidTagLabel)
      if (tagSet.length === 0) {
        setError('Add at least one word that describes what you do.')
        return
      }
      let anchorLocationId: string | undefined
      if (changingAddress && isLocationPlaceFieldsComplete(place)) {
        const made = await onCreateLocation(
          place.mode === 'address'
            ? {
                label: place.selectedAddress!.name,
                address: {
                  geographyWkt: `SRID=4326;POINT(${place.selectedAddress!.coordinates[0]} ${place.selectedAddress!.coordinates[1]})`,
                  resolvedAddressText: place.selectedAddress!.name,
                },
              }
            : { label: place.addressQuery, neighborhoodId: place.neighborhoodId! },
        )
        if (!made.ok) {
          // The action's own message, which is written for the owner — "we
          // never guess one" — rather than a generic failure.
          setError(made.message)
          return
        }
        anchorLocationId = made.data.id
      }

      try {
        const result = await onSave({
          groupId,
          pagePath,
          name,
          description,
          photoUrl,
          socialLinks: links,
          ...(showContact ? { contactPhone: phone.trim() === '' ? null : phone.trim(), openingHours: hours } : {}),
          ...(showContact !== contactOn ? { contactComponent: showContact } : {}),
          tags: tagSet,
          ...(anchorLocationId ? { anchorLocationId } : {}),
        })
        if (!result.ok) {
          setError(result.message)
          return
        }
        setSaved(true)
        setChangingAddress(false)
        setSavedState(current)
        setAskingToLeave(false)
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

      {/* #293 — shown to signed-in visitors only, never on the front door. */}
      {!showContact ? (
        <button
          type="button"
          onClick={() => setShowContact(true)}
          className="flex min-h-tap items-center self-start text-sm font-medium text-[var(--color-accent)] underline"
        >
          Add business hours and phone
        </button>
      ) : (
      <section data-testid="edit-contact" className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-[var(--color-fg)]">Contact</h2>
        <label className="block">
          <span className="text-sm font-medium text-[var(--color-fg)]">Business phone</span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="off"
            className="input mt-1 w-full"
            data-testid="edit-phone"
            placeholder="(916) 555-0142"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <span className="mt-1 block text-xs text-[var(--color-fg-muted)]">
            Optional. Signed-in visitors can tap to call. This is not the phone you signed up with.
          </span>
        </label>
        <HoursEditor value={hours} onChange={setHours} />
      </section>
      )}
      <TagInput idPrefix="edit-tag" value={tags} onChange={setTags} />

      {/* Where the Page is. Editable — this is the thing an owner moves. */}
      <div data-testid="edit-address">
        <span className="text-sm font-medium text-[var(--color-fg)]">Address</span>
        {!changingAddress ? (
          <>
            <p className="mt-1 text-sm text-[var(--color-fg)]">
              {initialAddressLabel ?? 'Not set yet.'}
            </p>
            <button
              type="button"
              data-testid="edit-address-change"
              className="mt-1 flex min-h-tap items-center text-sm text-[var(--color-accent)] underline"
              onClick={() => setChangingAddress(true)}
            >
              {initialAddressLabel ? 'Change it' : 'Add one'}
            </button>
          </>
        ) : (
          <div className="mt-1">
            <LocationPlaceFields state={place} setState={setPlace} idPrefix="edit-address" />
            <button
              type="button"
              data-testid="edit-address-cancel"
              className="mt-1 flex min-h-tap items-center text-sm text-[var(--color-accent)] underline"
              onClick={() => {
                setChangingAddress(false)
                setPlace(initialLocationPlaceFieldsState)
              }}
            >
              Keep it where it is
            </button>
          </div>
        )}
      </div>

      {/* The LINK, which is the thing that cannot move. Shown, not hidden, and
          the reason given: a field that quietly is not there reads as a
          missing feature. */}
      <div data-testid="edit-link-frozen">
        <span className="text-sm font-medium text-[var(--color-fg)]">Link</span>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          socialus.org{pagePath}
        </p>
        <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
          The name can change; this link can&rsquo;t. People have it already, and moving
          it would break it. <span className="sr-only">Current link: {slug}</span>
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

      <PostingSafetyNote />

      <div className="flex gap-2">
        <button type="submit" disabled={pending} data-testid="edit-save" className="btn-primary w-full disabled:opacity-50">
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        {unsaved ? (
          <button type="button" onClick={() => setAskingToLeave(true)} className="btn-secondary w-full text-center">
            Done
          </button>
        ) : (
          <a href={pagePath} className="btn-secondary w-full text-center">
            Done
          </a>
        )}
      </div>

      {/* #276 — copy is a placeholder ([public-is-draft]). */}
      {unsaved && askingToLeave ? (
        <div role="alertdialog" aria-label="Unsaved changes" data-testid="edit-unsaved" className="flex flex-col gap-2 rounded border border-[var(--color-control-border)] p-3">
          <p className="text-sm text-[var(--color-fg)]">You have unsaved changes.</p>
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-50">
              Save changes
            </button>
            <a href={pagePath} className="btn-secondary w-full text-center">
              Leave without saving
            </a>
          </div>
        </div>
      ) : null}
    </form>
  )
}
