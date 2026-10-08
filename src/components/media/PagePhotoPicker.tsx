'use client'

// F070 · T145 — choosing a photo for a Page.
//
// The first consumer of `lib/media/upload-image`, which has been in the tree
// since T120 with nothing calling it. That module resizes, re-encodes and puts
// the object in the media bucket; this one owns the waiting, the failure, and
// the removal.
//
// Reports a URL or null, never a File. The bytes stop here — `group.update_draft`
// records where the object landed and never sees it, which is what lets the same
// handler serve this composer and any later surface.

import { useCallback, useRef, useState } from 'react'
import { uploadImage } from '@/lib/media/upload-image'
import { COPY } from '@/lib/copy'
import { recordUploadAction } from '@/app/_actions/origin-actions'

export interface PagePhotoPickerProps {
  memberId: string
  /** Current photo URL, or null. Controlled — the parent owns the value. */
  value: string | null
  /** A URL when one is chosen; null when the member removes it. */
  onChange: (url: string | null) => void
  /** F099 — the same control picks a post's photo; the words say whose. */
  label?: string
  previewAlt?: string
}

export function PagePhotoPicker({ memberId, value, onChange, label = 'Photo', previewAlt = 'The photo on your Page' }: PagePhotoPickerProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // F080 — the uploader's word, asked for every photo and never remembered.
  const [confirmed, setConfirmed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const onPick = useCallback(
    async (file: File | undefined) => {
      if (!file) return
      // Clear first: a stale error next to a fresh attempt reads as a second
      // failure. Recovery has to look like recovery.
      setError(null)
      setBusy(true)
      try {
        const { url } = await uploadImage(file, memberId)
        // F102 criterion 13 — where it came from; best-effort, never blocks the photo.
        void recordUploadAction({ url }).catch(() => undefined)
        onChange(url)
      } catch (err) {
        // Never rethrow. A photo is optional and a failed upload must not trap
        // anyone in the composer — it says so and leaves the step passable.
        setError(
          err instanceof Error && err.message
            ? `That photo didn't upload — ${err.message}. You can try again, or carry on without one.`
            : "That photo didn't upload. You can try again, or carry on without one.",
        )
      } finally {
        setBusy(false)
        // Let the same file be re-picked after a failure; without this the
        // input holds the old value and change never fires again.
        if (inputRef.current) inputRef.current.value = ''
        setConfirmed(false)
      }
    },
    [memberId, onChange],
  )

  return (
    <div className="block">
      <span className="text-sm font-medium text-[var(--color-fg)]">{label}</span>

      {value ? (
        <div className="mt-2 flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            data-testid="page-photo-preview"
            src={value}
            alt={previewAlt}
            className="h-24 w-24 rounded object-cover"
          />
          <button
            type="button"
            className="inline-flex min-h-tap items-center px-1 text-sm underline text-[var(--color-fg-muted)]"
            onClick={() => onChange(null)}
          >
            Remove
          </button>
        </div>
      ) : null}

      {/* A bare file input looks like nothing in most browsers (#234). The
          button is what a person sees and presses; the input only chooses. */}
      <label className="mt-2 flex min-h-11 items-center gap-3 text-sm text-[var(--color-fg)]">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="h-4 w-4 shrink-0"
        />
        {COPY.photoConfirm}
      </label>
      <button
        type="button"
        disabled={busy || !confirmed}
        className="btn-secondary mt-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-50"
        onClick={() => inputRef.current?.click()}
      >
        {value ? 'Change photo' : 'Choose a photo'}
      </button>
      <input
        ref={inputRef}
        data-testid="page-photo-input"
        type="file"
        accept="image/*"
        aria-hidden="true"
        tabIndex={-1}
        disabled={busy || !confirmed}
        className="sr-only"
        onChange={(e) => onPick(e.target.files?.[0])}
      />

      {busy ? (
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">Uploading…</p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-1 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  )
}
