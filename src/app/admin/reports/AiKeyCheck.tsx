'use client'

// A button beside the AI readiness numbers: tap it to see whether the moderation key works, without filing a
// fake report. Nothing is called until it is tapped.

import { useState } from 'react'
import type { KeyStatus } from '@/lib/moderation/key-check'

const WORDS: Record<KeyStatus, string> = {
  connected: 'AI moderation: connected',
  not_set: 'AI moderation: not set',
  rejected: 'AI moderation: key rejected',
  unreachable: 'AI moderation: could not reach Anthropic',
}

export function AiKeyCheck({ check }: { check: () => Promise<KeyStatus> }) {
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    try {
      setText(WORDS[await check()])
    } catch {
      setText("Couldn't check just now. Mind trying again?")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button type="button" onClick={run} disabled={busy} className="btn-secondary min-h-tap">
        {busy ? 'Checking…' : 'Check the AI key'}
      </button>
      {text && (
        <p role="status" data-testid="ai-key-result" className="text-body-sm font-medium text-[var(--color-fg)]">
          {text}
        </p>
      )}
    </div>
  )
}
