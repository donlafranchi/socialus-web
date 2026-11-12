'use client'

// F118 — the phone's share sheet where there is one, otherwise copy the link. Sharing is phone to phone.

import { useCallback, useState } from 'react'
import { Share } from 'lucide-react'
import { Toast } from '@/components/Toast'
import { buttonClass } from '@/components/ui/Button'

export function InviteButton({ label, title, text, path, variant = 'secondary' }: { label: string; title: string; text: string; path: string; variant?: 'primary' | 'secondary' }) {
  const [toast, setToast] = useState<string | null>(null)
  const hide = useCallback(() => setToast(null), [])

  async function onShare() {
    const url = `${window.location.origin}${path}`
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url })
      } catch {
        // Dismissed; nothing to tell them.
      }
      return
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`)
      setToast('Link copied')
    } catch {
      setToast('Couldn’t copy the link')
    }
  }

  return (
    <>
      <button type="button" onClick={onShare} className={buttonClass(variant, 'md')}>
        <Share className="h-4 w-4" aria-hidden />
        {label}
      </button>
      <Toast message={toast ?? ''} visible={toast !== null} onHide={hide} />
    </>
  )
}
