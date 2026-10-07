'use client'

// #412 — the PM, 2026-10-06: the owner's Edit Page is section cards. Each card
// says what's set now and has one Edit, in its header, that opens the section's
// sheet (PageEditor) with one Save that saves and closes. Cards sit in
// collapsible groups, the first open. Precedent: Google Business Profile's Edit
// profile, Shopify settings, Airbnb's listing editor.

import { PageEditorProvider, SECTION_TITLE, usePageEditor, type EditorInitial, type Section } from './PageEditor'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatUsPhone } from '@/lib/phone'
import { socialLinksForDisplay } from '@/lib/groups/social-links'
import { PAGE_KIND_LABEL, PURPOSE_LABEL } from '@/lib/groups/page-kind'
import { SHOW_OPENING_HOURS } from '@/lib/features'
import type { EditPageInput, EditPageResult } from '@/app/g/[handle]/edit/actions'

const NOT_SET = 'Not set yet'
const DESCRIPTION_MAX = 60

function firstLine(text: string) {
  const line = text.trim().split('\n')[0]!.trim()
  return line.length > DESCRIPTION_MAX ? `${line.slice(0, DESCRIPTION_MAX).trimEnd()}…` : line
}

function summary(section: Section, i: EditorInitial): string {
  switch (section) {
    case 'name':
      return i.name.trim() || NOT_SET
    case 'description':
      return firstLine(i.description) || NOT_SET
    case 'photo':
      return i.photoUrl ? 'Photo set' : 'No photo'
    case 'kind':
      return `${PURPOSE_LABEL[i.purpose]} · Listed as ${PAGE_KIND_LABEL[i.kind]}`
    case 'where':
      return i.addressLabel ?? NOT_SET
    case 'contact': {
      const parts = [i.contact.phone && `Phone ${formatUsPhone(i.contact.phone)}`, SHOW_OPENING_HOURS && i.contact.hours && 'hours set'].filter(Boolean)
      return parts.join(' · ') || NOT_SET
    }
    case 'tags': {
      const n = i.tags.length
      if (n === 0) return NOT_SET
      return `${n} ${n === 1 ? 'tag' : 'tags'}: ${i.tags.slice(0, 2).join(', ')}${n > 2 ? ', …' : ''}`
    }
    case 'links':
      return socialLinksForDisplay(i.socialLinks).map((l) => l.label).join(', ') || NOT_SET
    case 'components': {
      const on = [i.contactOn && SECTION_TITLE.contact, i.productsOn && 'Products & services'].filter(Boolean)
      return on.join(', ') || 'Nothing extra'
    }
    default:
      return ''
  }
}

function Card({ section, initial }: { section: Section; initial: EditorInitial }) {
  const ctx = usePageEditor()
  const title = SECTION_TITLE[section]
  return (
    <section data-testid={`edit-card-${section}`} aria-label={title} className="card p-4">
      <header className="flex items-center justify-between gap-3">
        <h3 className="text-body-sm font-semibold text-[var(--color-fg)]">{title}</h3>
        <button
          type="button"
          data-testid={`edit-section-${section}`}
          aria-label={`Edit ${title[0]!.toLowerCase()}${title.slice(1)}`}
          onClick={() => ctx?.open(section)}
          className="press -my-2 -mr-2 inline-flex min-h-tap items-center rounded-md px-3 text-body-sm font-medium text-[var(--color-accent)] hover:bg-[var(--color-surface)]"
        >
          Edit
        </button>
      </header>
      <p data-testid="edit-summary" className="mt-1 truncate text-body-sm text-[var(--color-fg-muted)]">
        {summary(section, initial)}
      </p>
    </section>
  )
}

function Group({ id, title, open = false, sections, initial }: { id: string; title: string; open?: boolean; sections: Section[]; initial: EditorInitial }) {
  return (
    <details data-testid={`edit-group-${id}`} open={open} className="group">
      <summary className="press flex min-h-tap cursor-pointer list-none items-center justify-between gap-3 text-title-3 text-[var(--color-fg)] [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown size={20} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-2 flex flex-col gap-3">
        {sections.map((s) => (
          <Card key={s} section={s} initial={initial} />
        ))}
      </div>
    </details>
  )
}

export function EditCards({
  initial,
  onSave,
  isDraft,
}: {
  initial: EditorInitial
  onSave: (input: EditPageInput) => Promise<EditPageResult>
  isDraft: boolean
}) {
  return (
    <PageEditorProvider initial={initial} onSave={onSave}>
      <div data-testid="edit-cards" className="flex flex-col gap-4">
        <Group id="about" title="About your Page" open sections={['name', 'description', 'photo', 'kind', 'components']} initial={initial} />
        <Group id="location" title="Location" sections={['where']} initial={initial} />
        {/* Hours and phone: only where the Page shows them (Don, 2026-10-04). */}
        {initial.contactOn && <Group id="contact" title="Contact" sections={['contact']} initial={initial} />}
        <Group id="found" title="Tags and links" sections={['tags', 'links']} initial={initial} />

        {/* The LINK, which is the thing that cannot move (#180). Shown, not
            hidden, with the reason: a field that quietly is not there reads
            as a missing feature. */}
        <section data-testid="edit-link-frozen" aria-label="Link" className="card p-4">
          <h3 className="text-body-sm font-semibold text-[var(--color-fg)]">Link</h3>
          {isDraft ? (
            <>
              <p className="mt-1 break-all text-body-sm text-[var(--color-fg-muted)]">socialus.org{initial.pagePath}</p>
              <p className="mt-1 text-caption text-[var(--color-fg-muted)]">It stays the same when you publish.</p>
            </>
          ) : (
            <>
              <p className="mt-1 break-all text-body-sm text-[var(--color-fg-muted)]">socialus.org{initial.pagePath}</p>
              <p className="mt-1 text-caption text-[var(--color-fg-muted)]">
                The name can change; this link can&rsquo;t. People have it already, and moving it would break it.
              </p>
            </>
          )}
        </section>

        <Button href={initial.pagePath} variant="secondary" className="w-full">
          Done
        </Button>
      </div>
    </PageEditorProvider>
  )
}
