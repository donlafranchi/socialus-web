'use client'

// #412 — the PM, 2026-10-06: the owner's Edit Page is section cards. Each card
// says what's set now and has one pencil, in its header, that opens the
// section's sheet (PageEditor) with one Save that saves and closes. Precedent:
// Google Business Profile's Edit profile, Shopify settings, Airbnb's listing
// editor.

import { PageEditorProvider, SECTION_TITLE, usePageEditor, type EditorInitial, type Section } from './PageEditor'
import type { ReactNode } from 'react'
import { PencilButton } from '@/components/ui/PencilButton'
import { Button } from '@/components/ui/Button'
import { formatUsPhone } from '@/lib/phone'
import { socialLinksForDisplay } from '@/lib/groups/social-links'
import { PAGE_KIND_LABEL, PURPOSE_LABEL } from '@/lib/groups/page-kind'
import { SHOW_OPENING_HOURS } from '@/lib/features'
import type { EditPageInput, EditPageResult } from '@/app/g/[handle]/edit/actions'
import { PageSettings, type PageSettingsProps } from './PageSettings'

const NOT_SET = 'Not set yet'
const DESCRIPTION_MAX = 60

function firstLine(text: string) {
  const line = text.trim().split('\n')[0]!.trim()
  return line.length > DESCRIPTION_MAX ? `${line.slice(0, DESCRIPTION_MAX).trimEnd()}…` : line
}

const tagsLine = (tags: string[]) =>
  tags.length === 0 ? '' : `${tags.length} ${tags.length === 1 ? 'tag' : 'tags'}: ${tags.slice(0, 2).join(', ')}${tags.length > 2 ? ', …' : ''}`

function summary(section: Section, i: EditorInitial): string {
  switch (section) {
    case 'basics':
      return [i.name.trim() || NOT_SET, firstLine(i.description) || 'No description', i.photoUrl ? 'Photo set' : 'No photo'].join(' · ')
    case 'kind':
      return `${PURPOSE_LABEL[i.purpose]} · Listed as ${PAGE_KIND_LABEL[i.kind]}`
    case 'where':
      return i.addressLabel || NOT_SET
    case 'contact': {
      const parts = [i.contact.phone && `Phone ${formatUsPhone(i.contact.phone)}`, SHOW_OPENING_HOURS && i.contact.hours && 'hours set'].filter(Boolean)
      return parts.join(' · ') || NOT_SET
    }
    case 'found': {
      const links = socialLinksForDisplay(i.socialLinks).map((l) => l.label).join(', ')
      if (i.tags.length === 0 && !links) return NOT_SET
      return [tagsLine(i.tags) || 'No tags', links || 'No links'].join(' · ')
    }
    case 'components': {
      const on = [i.contactOn && SECTION_TITLE.contact, i.productsOn && 'Products & services'].filter(Boolean)
      return on.join(', ') || 'Nothing extra'
    }
    default:
      return ''
  }
}

function Card({ section, initial, children }: { section: Section; initial: EditorInitial; children?: ReactNode }) {
  const ctx = usePageEditor()
  const title = SECTION_TITLE[section]
  return (
    <section data-testid={`edit-card-${section}`} aria-label={title} className="card border border-[var(--color-border)] p-4">
      <header className="flex items-center justify-between gap-3">
        <h3 className="text-body-sm font-semibold text-[var(--color-fg)]">{title}</h3>
        <PencilButton label={`Edit ${title}`} testId={`edit-section-${section}`} onClick={() => ctx?.open(section)} className="-my-2 -mr-2" />
      </header>
      <p data-testid="edit-summary" className="mt-1 truncate text-body-sm text-[var(--color-fg-muted)]">
        {summary(section, initial)}
      </p>
      {children}
    </section>
  )
}

export function EditCards({
  title,
  initial,
  onSave,
  isDraft,
  settings,
}: {
  title: string
  initial: EditorInitial
  onSave: (input: EditPageInput) => Promise<EditPageResult>
  isDraft: boolean
  /** #423 — archive and delete, for a live or archived Page. */
  settings?: Pick<PageSettingsProps, 'lifecycleState' | 'onArchive' | 'onRestore' | 'onDelete'>
}) {
  return (
    <PageEditorProvider initial={initial} onSave={onSave}>
      {/* The way out sits in the header, not loose under the last card (Apple HIG's Done in the nav bar). */}
      <header data-testid="edit-header" className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-title-1 text-[var(--color-fg)]">{title}</h1>
          <p className="mt-1 text-body-sm text-[var(--color-fg-muted)]">Only you can see this.</p>
        </div>
        <Button href={initial.pagePath} variant="secondary" className="shrink-0">
          Done
        </Button>
      </header>
      {/* #452 — the PM, 2026-10-06: fewer groups, one pencil per card (Google
          Business Profile's editor, Airbnb's listing editor). */}
      <div data-testid="edit-cards" className="flex flex-col gap-4">
        <Card section="basics" initial={initial} />
        <Card section="where" initial={initial} />
        {/* The phone: only where the Page shows it (Don, 2026-10-04). */}
        {initial.contactOn && <Card section="contact" initial={initial} />}
        <Card section="found" initial={initial}>
          {/* The link can't move (#180); said here rather than in a card of its own. */}
          <p className="mt-3 break-all text-body-sm text-[var(--color-fg)]">socialus.org{initial.pagePath}</p>
          <p className="mt-1 text-caption text-[var(--color-fg-muted)]">
            {isDraft ? 'It stays the same when you publish.' : 'The name can change; this link can’t. People have it already, and moving it would break it.'}
          </p>
        </Card>

        {/* #465 — planned, not built: nothing to tap, and nothing on the Page. Copy is draft ([public-is-draft]). */}
        <section data-testid="edit-card-values" aria-label="Values & badges" className="card border border-[var(--color-border)] p-4">
          <header className="flex items-center justify-between gap-3">
            <h3 className="text-body-sm font-semibold text-[var(--color-fg)]">Values &amp; badges</h3>
            <span className="chip whitespace-nowrap text-xs">Coming soon</span>
          </header>
          <p className="mt-1 text-body-sm text-[var(--color-fg-muted)]">Soon you&rsquo;ll be able to show what you&rsquo;re about and what you stand for.</p>
        </section>

        <section data-testid="edit-settings" aria-labelledby="edit-settings-title" className="mt-4 flex flex-col gap-3">
          <h2 id="edit-settings-title" className="text-title-3 text-[var(--color-fg)]">
            Page settings
          </h2>
          <Card section="kind" initial={initial} />
          <Card section="components" initial={initial} />
          {settings && !isDraft && <PageSettings groupId={initial.groupId} pagePath={initial.pagePath} name={initial.name} {...settings} />}
        </section>
      </div>
    </PageEditorProvider>
  )
}
