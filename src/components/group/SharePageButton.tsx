'use client'

// #409 — Share, for anyone on a published Page: the phone's share sheet where
// there is one (Web Share API), otherwise copy the link and say so. Since Don's
// 2026-10-31 "I can't share an anouncment?", every post uses it too, quieter.

import { useCallback, useState } from 'react'
import { Share } from 'lucide-react'
import { Toast } from '@/components/Toast'

export function SharePageButton({ title, path, quiet = false, testId = 'page-share' }: { title: string; path: string; quiet?: boolean; testId?: string }) {
  const [toast, setToast] = useState<string | null>(null)
  const hide = useCallback(() => setToast(null), [])

  async function onShare() {
    const url = `${window.location.origin}${path}`
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
      } catch {
        // Dismissed, or the sheet could not open; nothing to tell them.
      }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setToast('Link copied')
    } catch {
      setToast('Couldn’t copy the link')
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onShare}
        aria-label="Share"
        title="Share"
        data-testid={testId}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-neutral-100 ${quiet ? 'text-[var(--color-fg-muted)]' : 'text-[var(--color-charcoal-900)]'}`}
      >
        <Share size={quiet ? 16 : 20} aria-hidden="true" />
      </button>
      <Toast message={toast ?? ''} visible={toast !== null} onHide={hide} />
    </>
  )
}
