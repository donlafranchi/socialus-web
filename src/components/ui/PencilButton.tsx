// #453 — the PM, 2026-10-06: edit is a pencil icon button, not the word
// (LinkedIn's and Google Business Profile's section headers). 44px, with the
// accessible name "Edit <section>".

import Link from 'next/link'
import { Pencil } from 'lucide-react'

const CLS =
  'press inline-flex size-tap shrink-0 items-center justify-center rounded-full text-[var(--color-fg)] hover:bg-[var(--color-surface)]'

export function PencilButton({
  label,
  onClick,
  href,
  className = '',
  testId,
}: {
  label: string
  onClick?: () => void
  href?: string
  className?: string
  testId?: string
}) {
  const icon = <Pencil size={18} aria-hidden="true" />
  if (href)
    return (
      <Link href={href} aria-label={label} title={label} data-testid={testId} className={`${CLS} ${className}`.trim()}>
        {icon}
      </Link>
    )
  return (
    <button type="button" aria-label={label} title={label} data-testid={testId} onClick={onClick} className={`${CLS} ${className}`.trim()}>
      {icon}
    </button>
  )
}
