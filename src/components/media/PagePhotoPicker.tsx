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

export interface PagePhotoPickerProps {
  memberId: string
  /** Current photo URL, or null. Controlled — the parent owns the value. */
  value: string | null
  /** A URL when one is chosen; null when the member removes it. */
  onChange: (url: string | null) => void
}

export function PagePhotoPicker({ memberId, value, onChange }: PagePhotoPickerProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
      }
    },
    [memberId, onChange],
  )

  return (
    <div className="block">
      <span className="block text-sm font-medium text-[var(--color-fg)]">Photo</span>

      {value ? (
        <div className="mt-2 flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            data-testid="page-photo-preview"
            src={value}
            alt="The photo on your Page"
            className="h-24 w-24 rounded object-cover"
          />
          <button
            type="button"
            className="text-sm underline text-[var(--color-fg-muted)]"
            onClick={() => onChange(null)}
          >
            Remove
          </button>
        </div>
      ) : null}

      {/* A labelled button, not the browser's bare "Choose File / No file
          chosen", which does not read as the thing to press. */}
      <label className={`btn-secondary press mt-2 flex w-fit cursor-pointer ${busy ? 'opacity-50' : ''}`}>
        {value ? 'Choose a different photo' : 'Choose a photo'}
        <input
          ref={inputRef}
          data-testid="page-photo-input"
          type="file"
          accept="image/*"
          aria-label="Choose a photo for your Page"
          disabled={busy}
          className="sr-only"
          onChange={(e) => onPick(e.target.files?.[0])}
        />
      </label>

      {busy ? (
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">Uploading…</p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-1 text-sm text-[var(--color-danger,#b00)]">
          {error}
        </p>
      ) : null}
    </div>
  )
}
