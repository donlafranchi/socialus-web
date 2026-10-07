'use client'

// #301 — L14, on the draft Page in the owner view. Publishing needs a name,
// where it is (an address or an area), a description and a tag; a photo is
// optional.
// F082 — and the rules, agreed to before every Publish (never before a draft).
// Copy is the design's placeholder ([public-is-draft]).

import { useState } from 'react'
import Link from 'next/link'
import { usePageEditor, type Section } from '@/components/group/edit/PageEditor'

// #302 — the checklist opens the section's own sheet, in place.
const SECTION_FOR: Record<string, Section> = { name: 'name', where: 'where', description: 'description', tags: 'tags', photo: 'photo' }

function AddOrChange({ editPath, section, children }: { editPath: string; section: Section; children: React.ReactNode }) {
  const ctx = usePageEditor()
  const cls = 'press min-h-tap text-body-sm font-medium text-[var(--color-charcoal-900)] underline'
  if (!ctx) return <Link href={editPath} className={cls}>{children}</Link>
  return (
    <button type="button" className={cls} onClick={() => ctx.open(section)}>
      {children}
    </button>
  )
}
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { CREATOR_RULES, RULES_VERSION } from '@/lib/creator-rules'

interface Props {
  editPath: string
  hasName: boolean
  hasPlace: boolean
  hasDescription: boolean
  hasTags: boolean
  hasPhoto: boolean
  /** Called with the rules version the member agreed to. */
  onPublish: (rulesVersion: number) => Promise<void>
}

export function BeforeYouPublish({ editPath, hasName, hasPlace, hasDescription, hasTags, hasPhoto, onPublish }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [agreed, setAgreed] = useState(false)
  const items = [
    { key: 'name', label: 'Name', done: hasName },
    { key: 'where', label: 'Where it is', done: hasPlace },
    { key: 'description', label: 'Description', done: hasDescription },
    { key: 'tags', label: 'Tags', done: hasTags },
    { key: 'photo', label: 'Photo (optional)', done: hasPhoto },
  ]
  const missing = [!hasName && 'a name', !hasPlace && 'where it is', !hasDescription && 'a description', !hasTags && 'a tag'].filter(
    Boolean,
  ) as string[]
  const ready = missing.length === 0

  const publish = async () => {
    setBusy(true)
    setError(null)
    try {
      await onPublish(RULES_VERSION)
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't go through. Try again?")
      setBusy(false)
    }
  }

  return (
    <section data-testid="before-you-publish" className="rounded-lg border border-[var(--color-border)] p-4">
      <h2 className="text-title-3 text-[var(--color-fg)]">Before you publish</h2>
      <p className="mt-1 text-caption text-[var(--color-fg-muted)]">Four things, then it&rsquo;s live.</p>
      <ul className="mt-3 flex flex-col">
        {items.map((i) => (
          <li
            key={i.key}
            data-testid={`publish-item-${i.key}`}
            data-done={i.done ? 'true' : 'false'}
            className="flex min-h-tap items-center gap-3 border-b border-[var(--color-border)] last:border-b-0"
          >
            <span
              aria-hidden="true"
              className={`inline-flex size-5 items-center justify-center rounded-sm border ${
                i.done ? 'border-[var(--color-charcoal-700)] bg-[var(--color-charcoal-700)] text-white' : 'border-[var(--color-control-border)]'
              }`}
            >
              {i.done && <Check size={14} />}
            </span>
            <span className="flex-1 text-body-sm text-[var(--color-fg)]">
              {i.label}
              <span className="sr-only">{i.done ? ', done' : ', not yet'}</span>
            </span>
            <AddOrChange editPath={editPath} section={SECTION_FOR[i.key]}>
              {i.done ? 'Change' : 'Add'}
              <span className="sr-only"> {i.label}</span>
            </AddOrChange>
          </li>
        ))}
      </ul>
      {!ready && (
        <p className="mt-3 text-caption text-[var(--color-fg-muted)]">
          Add {missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} and ${missing.at(-1)}`} to
          publish.
        </p>
      )}
      <div data-testid="creator-rules" className="mt-4 border-t border-[var(--color-border)] pt-4">
        <h3 className="text-title-3 text-[var(--color-fg)]">The rules</h3>
        <ul className="mt-2 flex flex-col gap-3">
          {CREATOR_RULES.map((r) => (
            <li key={r.rule}>
              <p className="text-body-sm font-medium text-[var(--color-fg)]">{r.rule}</p>
              <p className="text-caption text-[var(--color-fg-muted)]">{r.reason}</p>
            </li>
          ))}
        </ul>
        <label className="mt-3 flex min-h-tap items-center gap-3 text-body-sm text-[var(--color-fg)]">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="size-5 accent-[var(--color-charcoal-700)]"
          />
          I agree to these rules
        </label>
        <Link href="/rules" className="press inline-flex min-h-tap items-center text-body-sm font-medium text-[var(--color-charcoal-900)] underline">
          Read the rules
        </Link>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-body-sm text-[var(--color-fg)]">
          {error}
        </p>
      )}
      <Button className="mt-3 w-full" onClick={publish} disabled={!ready || !agreed || busy}>
        Publish
      </Button>
    </section>
  )
}
