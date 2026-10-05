'use client'

// #302 — Don, 2026-10-04: edit in place, by section. The owner sees their Page
// as visitors do, with one Edit/Done toggle (Apple Contacts); in edit mode each
// section shows a small edit button, and tapping it opens a sheet with only that
// section's fields and one Save that saves and closes (Google Business Profile's
// Edit profile sections, Airbnb's listing editor). Done only leaves edit mode:
// nothing is ever left unsaved, so there's no save bar.

import { createContext, useContext, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { Button, buttonClass } from '@/components/ui/Button'
import { SocialHandleFields } from '@/components/group/SocialHandleFields'
import { PagePhotoPicker } from '@/components/media/PagePhotoPicker'
import { HoursEditor } from '@/components/group/HoursEditor'
import { TagInput, type TagInputValue } from '@/components/tags/TagInput'
import {
  LocationPlaceFields,
  initialLocationPlaceFieldsState,
  isLocationPlaceFieldsComplete,
  type LocationPlaceFieldsState,
} from '@/components/locations/LocationPlaceFields'
import { createLocationAction } from '@/app/_actions/location-actions'
import { handlesFromLinks, linksFromHandles } from '@/lib/groups/social-handles'
import { isValidTagLabel } from '@/lib/groups/tags'
import { formatUsPhone } from '@/lib/phone'
import type { SocialLinks, SocialPlatform } from '@/lib/groups/social-links'
import type { OpeningHours } from '@/lib/groups/opening-hours'
import type { EditPageInput, EditPageResult } from '@/app/g/[handle]/edit/actions'

export type Section = 'about' | 'photo' | 'where' | 'contact' | 'tags' | 'links' | 'components'

export const SECTION_TITLE: Record<Section, string> = {
  about: 'About',
  photo: 'Photo',
  where: 'Where',
  contact: 'Hours and phone',
  tags: 'Tags',
  links: 'Links',
  components: 'What your Page shows',
}

export interface EditorInitial {
  groupId: string
  pagePath: string
  memberId: string
  name: string
  description: string
  photoUrl: string | null
  socialLinks: SocialLinks
  tags: string[]
  contact: { phone: string | null; hours: OpeningHours | null }
  contactOn: boolean
  addressLabel: string | null
}

type Save = (input: EditPageInput) => Promise<EditPageResult>

interface Ctx {
  editing: boolean
  setEditing: (v: boolean) => void
  open: (s: Section) => void
}
const EditorContext = createContext<Ctx | null>(null)
export const usePageEditor = () => useContext(EditorContext)

export function PageEditorProvider({ initial, onSave, children }: { initial: EditorInitial; onSave: Save; children: ReactNode }) {
  const [editing, setEditing] = useState(false)
  const [section, setSection] = useState<Section | null>(null)
  return (
    <EditorContext.Provider value={{ editing, setEditing, open: setSection }}>
      {children}
      {section && <SectionSheet key={section} section={section} initial={initial} onSave={onSave} onClose={() => setSection(null)} />}
    </EditorContext.Provider>
  )
}

/** The owner bar's one toggle. Done only leaves edit mode. */
export function EditToggle({ className = '' }: { className?: string }) {
  const ctx = usePageEditor()
  if (!ctx) return null
  return (
    <button
      type="button"
      data-testid="owner-edit-toggle"
      aria-pressed={ctx.editing}
      onClick={() => ctx.setEditing(!ctx.editing)}
      className={`${buttonClass(ctx.editing ? 'primary' : 'secondary')} ${className}`}
    >
      {ctx.editing ? 'Done' : 'Edit'}
    </button>
  )
}

/** A section's small edit affordance, shown only in edit mode. */
export function SectionEditButton({ section, className = '' }: { section: Section; className?: string }) {
  const ctx = usePageEditor()
  if (!ctx?.editing) return null
  return (
    <button
      type="button"
      data-testid={`edit-section-${section}`}
      aria-label={`Edit ${SECTION_TITLE[section].toLowerCase()}`}
      onClick={() => ctx.open(section)}
      className={`press inline-flex min-h-tap items-center gap-1 rounded-full px-3 text-body-sm font-medium text-[var(--color-accent)] hover:bg-[var(--color-surface)] ${className}`}
    >
      <Pencil size={14} aria-hidden="true" />
      Edit
    </button>
  )
}

function SectionSheet({ section, initial, onSave, onClose }: { section: Section; initial: EditorInitial; onSave: Save; onClose: () => void }) {
  const router = useRouter()
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description)
  const [photoUrl, setPhotoUrl] = useState(initial.photoUrl)
  const [handles, setHandles] = useState<Partial<Record<SocialPlatform, string>>>(() => handlesFromLinks(initial.socialLinks))
  const [tags, setTags] = useState<TagInputValue>({ tags: initial.tags, draft: '' })
  const [phone, setPhone] = useState(initial.contact.phone ? formatUsPhone(initial.contact.phone) : '')
  const [hours, setHours] = useState(initial.contact.hours)
  const [contactOn, setContactOn] = useState(initial.contactOn)
  const [place, setPlace] = useState<LocationPlaceFieldsState>(initialLocationPlaceFieldsState)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const snapshot = () => JSON.stringify({ name, description, photoUrl, handles, tags: tags.tags, draft: tags.draft, phone, hours, contactOn, place })
  const [start] = useState(snapshot)
  const dirty = snapshot() !== start

  const save = async () => {
    setError(null)
    const base = { groupId: initial.groupId, pagePath: initial.pagePath }
    let patch: Partial<EditPageInput> = {}
    if (section === 'about') patch = { name, description }
    if (section === 'photo') patch = { photoUrl }
    if (section === 'contact') patch = { contactPhone: phone.trim() === '' ? null : phone.trim(), openingHours: hours }
    if (section === 'components') patch = { contactComponent: contactOn }
    if (section === 'links') {
      const { links, problems } = linksFromHandles(handles)
      const bad = Object.entries(problems)[0]
      if (bad) return setError(`${bad[0]}: ${bad[1]}`)
      patch = { socialLinks: links }
    }
    if (section === 'tags') {
      const set = [...tags.tags, tags.draft].filter(isValidTagLabel)
      if (set.length === 0) return setError('Add at least one word that describes what you do.')
      patch = { tags: set }
    }
    setBusy(true)
    if (section === 'where') {
      if (!isLocationPlaceFieldsComplete(place)) {
        setBusy(false)
        return setError('Choose an address or a neighbourhood first.')
      }
      const made = await createLocationAction(
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
        setBusy(false)
        return setError(made.message)
      }
      patch = { anchorLocationId: made.data.id }
    }
    const res = await onSave({ ...base, ...patch } as EditPageInput)
    setBusy(false)
    if (!res.ok) return setError(res.message)
    onClose()
    router.refresh()
  }

  const cancel = () => (dirty ? setConfirming(true) : onClose())

  return (
    <Sheet
      open
      title={SECTION_TITLE[section]}
      onClose={cancel}
      testId={`sheet-${section}`}
      footer={
        confirming ? (
          <div className="flex flex-col gap-2">
            <p className="text-body-sm text-[var(--color-fg)]">Discard your changes?</p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setConfirming(false)}>Keep editing</Button>
              <Button variant="danger" onClick={onClose}>Discard</Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={cancel}>Cancel</Button>
            <Button onClick={save} disabled={busy} className="flex-1">{busy ? 'Saving…' : 'Save'}</Button>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {section === 'about' && (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-[var(--color-fg)]">Name</span>
              <input className="input" data-testid="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-[var(--color-fg)]">Description</span>
              <textarea className="input" rows={5} data-testid="edit-description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
          </>
        )}
        {section === 'photo' && <PagePhotoPicker memberId={initial.memberId} value={photoUrl} onChange={setPhotoUrl} />}
        {section === 'where' && (
          <>
            {initial.addressLabel && <p className="text-sm text-[var(--color-fg-muted)]">Now: {initial.addressLabel}</p>}
            <LocationPlaceFields state={place} setState={setPlace} idPrefix="edit-address" />
          </>
        )}
        {section === 'contact' && (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-[var(--color-fg)]">Business phone</span>
              <input type="tel" inputMode="tel" autoComplete="off" className="input" data-testid="edit-phone" placeholder="(916) 555-0142" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <span className="text-caption text-[var(--color-fg-muted)]">Optional. Signed-in visitors can tap to call. This is not the phone you signed up with.</span>
            </label>
            <HoursEditor value={hours} onChange={setHours} />
          </>
        )}
        {section === 'tags' && <TagInput idPrefix="edit-tag" value={tags} onChange={setTags} />}
        {section === 'links' && <SocialHandleFields value={handles} onChange={setHandles} />}
        {section === 'components' && (
          <label className="flex min-h-tap cursor-pointer items-center justify-between gap-3">
            <span className="text-sm text-[var(--color-fg)]">Business hours and phone</span>
            <input type="checkbox" role="switch" className="h-5 w-5" checked={contactOn} onChange={(e) => setContactOn(e.target.checked)} />
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm text-[var(--color-fg)]">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  )
}
