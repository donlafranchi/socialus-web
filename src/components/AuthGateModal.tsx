'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'

export type AuthGateIntent = 'support' | 'follow' | 'save' | 'generic'

interface Props {
  open: boolean
  onClose: () => void
  headline: string
  subtext?: string
  intent: AuthGateIntent
}

export function AuthGateModal({ open, onClose, headline, subtext, intent }: Props) {
  const pathname = usePathname() || '/'
  if (!open) return null
  const next = encodeURIComponent(pathname)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 p-4"
      data-testid="auth-gate-modal"
      data-intent={intent}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg w-full max-w-sm p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 p-1 text-neutral-500 hover:text-neutral-900"
        >
          <X size={18} />
        </button>
        <h3 className="text-lg font-semibold pr-8">{headline}</h3>
        {subtext && <p className="text-sm text-neutral-600 mt-2">{subtext}</p>}
        <div className="mt-5 flex flex-col gap-2">
          <Link
            href={`/auth/login?next=${next}`}
            data-testid="auth-gate-signup"
            className="btn-primary w-full"
          >
            Sign in
          </Link>
          <p className="text-xs text-neutral-500 text-center">
            We email you a link — no password, takes 30 seconds.
          </p>
        </div>
        <p className="text-xs text-neutral-500 text-center mt-5 border-t border-neutral-200 pt-3">
          Are you a business owner?{' '}
          <Link href="/join" className="text-[var(--color-accent)] font-medium hover:underline">
            Create a Page for your business →
          </Link>
        </p>
      </div>
    </div>
  )
}
