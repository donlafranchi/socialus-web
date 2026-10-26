'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { OPEN_COPY } from '@/lib/open-market-copy'

// The system share sheet where there is one (phones), the clipboard otherwise.
export function ShareMarketLink({ title }: { title: string }) {
  const [copied, setCopied] = useState(false)
  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share) return await navigator.share({ title, url })
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // Dismissing the share sheet is not an error.
    }
  }
  return (
    <div className="flex items-center gap-3">
      <Button onClick={share}>{OPEN_COPY.shareButton}</Button>
      <span role="status" className="text-body-sm text-[var(--color-fg-muted)]">
        {copied ? OPEN_COPY.copied : ''}
      </span>
    </div>
  )
}
