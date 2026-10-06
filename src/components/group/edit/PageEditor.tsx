'use client'

// #302 — Don, 2026-10-04: edit in place, by section. The owner sees their Page
// as visitors do, with one Edit/Done toggle (Apple Contacts); in edit mode each
// section shows a small edit button, and tapping it opens a sheet with only that
// section's fields and one Save that saves and closes (Google Business Profile's
// Edit profile sections, Airbnb's listing editor). Done only leaves edit mode:
// nothing is ever left unsaved, so there's no save bar. Don, 2026-10-05: each
// Add opens only its own fields, with pickers rather than long lists, and one
// primary button (Save); the header's close is the way out.

import { createContext, useContext, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { Button, buttonClass } from '@/components/ui/Button'
import { SocialHandleFields } from '@/components/group/SocialHandleFields'
import { PagePhotoPicker } from '@/components/media/PagePhotoPicker'
import { HoursEditor } from '@/components/group/HoursEditor'
import { TagInput, type TagInputValue } from '@/components/tags/TagInput'
import { WhereFields, type WhereValue } from '@/components/locations/WhereFields'
import { wherePatch } from '@/components/locations/where-save'
import { createLocationAction, metroAnchorPlaceAction } from '@/app/_actions/location-actions'
import { handlesFromLinks, linksFromHandles } from '@/lib/groups/social-handles'
import { isValidTagLabel } from '@/lib/groups/tags'
import { formatUsPhone } from '@/lib/phone'
import type { SocialLinks, SocialPlatform } from '@/lib/groups/social-links'
import type { OpeningHours } from '@/lib/groups/opening-hours'
import type { EditPageInput, EditPageResult } from '@/app/g/[handle]/edit/actions'
import { SHOW_OPENING_HOURS } from '@/lib/features'
import { PAGE_KINDS, PAGE_KIND_LABEL, PURPOSES, PURPOSE_LABEL, TYPE_FOR_PURPOSE, type PageKind, type Purpose } from '@/lib/groups/page-kind'

export type Section = 'kind' | 'about' | 'name' | 'description' | 'photo' | 'where' | 'contact' | 'tags' | 'links' | 'components'

export const SECTION_TITLE: Record<Section, string> = {
  kind: 'What your Page is for',
  about: 'About',
  name: 'Name',
  description: 'Description',
  photo: 'Photo',
  where: 'Where',
  contact: SHOW_OPENING_HOURS ? 'Hours and phone' : 'Business phone',
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
  kind: PageKind
  purpose: Purpose
  productsOn: boolean
  where: WhereValue
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
  const [kind, setKind] = useState<PageKind>(initial.kind)
  const [purpose, setPurpose] = useState<Purpose>(initial.purpose)
  const [productsOn, setProductsOn] = useState(initial.productsOn)
  const [where, setWhere] = useState<WhereValue>(initial.where)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const snapshot = () => JSON.stringify({ kind, purpose, productsOn, name, description, photoUrl, handles, tags: tags.tags, draft: tags.draft, phone, hours, contactOn, where })
  const [start] = useState(snapshot)
  const dirty = snapshot() !== start

  const save = async () => {
    setError(null)
    const base = { groupId: initial.groupId, pagePath: initial.pagePath }
    let patch: Partial<EditPageInput> = {}
    if (section === 'kind') patch = { pageKind: kind, purpose }
    if (section === 'about') patch = { name, description }
    if (section === 'name') {
      if (name.trim() === '') return setError('Give your Page a name.')
      patch = { name }
    }
    if (section === 'description') patch = { description }
    if (section === 'photo') patch = { photoUrl }
    if (section === 'contact')
      patch = { contactPhone: phone.trim() === '' ? null : phone.trim(), ...(SHOW_OPENING_HOURS ? { openingHours: hours } : {}) }
    if (section === 'components') patch = { contactComponent: contactOn, productsComponent: productsOn }
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
      const w = await wherePatch(where, initial.where.mode, { createLocation: createLocationAction, metroAnchor: metroAnchorPlaceAction })
      if (!w || !w.ok) {
        setBusy(false)
        return setError(w ? w.message : 'Choose how people find you, then finish that answer.')
      }
      patch = w.patch
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
          <Button onClick={save} disabled={busy} className="w-full" data-testid="sheet-save">
            {busy ? 'Saving…' : 'Save'}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {section === 'kind' && (
          <div className="flex flex-col gap-4">
            {/* Don ruled A, 2026-10-05: purpose first; the type follows it, and the owner can change it. */}
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold text-[var(--color-fg)]">What it&rsquo;s mainly for</legend>
              {PURPOSES.map((p) => (
                <label key={p} className={`flex min-h-tap cursor-pointer items-center gap-3 rounded-md border px-3 ${purpose === p ? 'border-[var(--color-charcoal-700)]' : 'border-[var(--color-border)]'}`}>
                  <input
                    type="radio"
                    name="page-purpose"
                    className="h-4 w-4"
                    checked={purpose === p}
                    onChange={() => {
                      setPurpose(p)
                      setKind(TYPE_FOR_PURPOSE[p])
                    }}
                  />
                  <span className="text-body-sm text-[var(--color-fg)]">{PURPOSE_LABEL[p]}</span>
                </label>
              ))}
            </fieldset>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-[var(--color-fg)]">Listed as</span>
              <select className="input" data-testid="edit-page-type" value={kind} onChange={(e) => setKind(e.target.value as PageKind)}>
                {PAGE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {PAGE_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
              <span className="text-caption text-[var(--color-fg-muted)]">How people find it when they browse. Locally owned is for businesses.</span>
            </label>
          </div>
        )}
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
        {section === 'name' && (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-[var(--color-fg)]">Name</span>
            <input className="input" data-testid="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        {section === 'description' && (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-[var(--color-fg)]">Description</span>
            <textarea className="input" rows={5} data-testid="edit-description" value={description} onChange={(e) => setDescription(e.target.value)} />
            <span className="text-caption text-[var(--color-fg-muted)]">A line or two on what you do and who it&rsquo;s for.</span>
          </label>
        )}
        {section === 'photo' && <PagePhotoPicker memberId={initial.memberId} value={photoUrl} onChange={setPhotoUrl} />}
        {section === 'where' && (
          <>
            {initial.addressLabel && <p className="text-sm text-[var(--color-fg-muted)]">Now: {initial.addressLabel}</p>}
            <WhereFields value={where} onChange={setWhere} />
          </>
        )}
        {section === 'contact' && (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-[var(--color-fg)]">Business phone</span>
              <input type="tel" inputMode="tel" autoComplete="off" className="input" data-testid="edit-phone" placeholder="(916) 555-0142" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <span className="text-caption text-[var(--color-fg-muted)]">Optional. Signed-in visitors can tap to call. This is not the phone you signed up with.</span>
            </label>
            {SHOW_OPENING_HOURS && <HoursEditor value={hours} onChange={setHours} />}
          </>
        )}
        {section === 'tags' && <TagInput idPrefix="edit-tag" value={tags} onChange={setTags} />}
        {section === 'links' && <SocialHandleFields compact value={handles} onChange={setHandles} />}
        {section === 'components' && (
          <>
            <label className="flex min-h-tap cursor-pointer items-center justify-between gap-3">
              <span className="text-sm text-[var(--color-fg)]">{SHOW_OPENING_HOURS ? 'Business hours and phone' : 'Business phone'}</span>
              <input type="checkbox" role="switch" className="h-5 w-5" checked={contactOn} onChange={(e) => setContactOn(e.target.checked)} />
            </label>
            <label className="flex min-h-tap cursor-pointer items-center justify-between gap-3">
              <span className="text-sm text-[var(--color-fg)]">Products &amp; services</span>
              <input type="checkbox" role="switch" className="h-5 w-5" checked={productsOn} onChange={(e) => setProductsOn(e.target.checked)} />
            </label>
          </>
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
