'use client'

// #301 — L14, on the draft Page in the owner view. Publishing needs a name,
// where it is (an address or an area), a description and a tag; a photo is
// optional.
// Copy is the design's placeholder ([public-is-draft]).

import { useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface Props {
  editPath: string
  hasName: boolean
  hasPlace: boolean
  hasDescription: boolean
  hasTags: boolean
  hasPhoto: boolean
  onPublish: () => Promise<void>
}

export function BeforeYouPublish({ editPath, hasName, hasPlace, hasDescription, hasTags, hasPhoto, onPublish }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
      await onPublish()
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
            <Link href={editPath} className="text-body-sm font-medium text-[var(--color-charcoal-900)] underline">
              {i.done ? 'Change' : 'Add'}
              <span className="sr-only"> {i.label}</span>
            </Link>
          </li>
        ))}
      </ul>
      {!ready && (
        <p className="mt-3 text-caption text-[var(--color-fg-muted)]">
          Add {missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} and ${missing.at(-1)}`} to
          publish.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-body-sm text-[var(--color-fg)]">
          {error}
        </p>
      )}
      <Button className="mt-3 w-full" onClick={publish} disabled={!ready || busy}>
        Publish
      </Button>
    </section>
  )
}
