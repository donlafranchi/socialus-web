// #297 — the one button. md 44 / sm 36, weight 600. One primary per screen;
// danger only inside a confirm dialog.

import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger'
type Size = 'md' | 'sm'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]',
  secondary: 'border border-[var(--color-border)] bg-white text-[var(--color-fg)] hover:bg-[var(--color-surface)]',
  quiet: 'text-[var(--color-charcoal-900)] underline hover:bg-neutral-100',
  danger: 'bg-red-700 text-white hover:bg-red-800',
}
const SIZE: Record<Size, string> = {
  md: 'min-h-tap px-5 text-body-sm',
  sm: 'h-9 px-4 text-body-sm',
}

export const buttonClass = (variant: Variant = 'primary', size: Size = 'md') =>
  `press inline-flex items-center justify-center gap-2 rounded-md font-semibold disabled:opacity-50 hover:no-underline ${SIZE[size]} ${VARIANT[variant]}`

type Common = { variant?: Variant; size?: Size; children: ReactNode; className?: string }

export function Button(
  props: Common & (({ href: string } & Omit<ComponentProps<typeof Link>, 'href'>) | ({ href?: undefined } & ComponentProps<'button'>)),
) {
  const { variant = 'primary', size = 'md', className = '', children, ...rest } = props
  const cls = `${buttonClass(variant, size)} ${className}`.trim()
  if ('href' in rest && rest.href !== undefined) {
    const { href, ...link } = rest as { href: string } & Omit<ComponentProps<typeof Link>, 'href'>
    return (
      <Link href={href} data-variant={variant} className={cls} {...link}>
        {children}
      </Link>
    )
  }
  return (
    <button type="button" data-variant={variant} className={cls} {...(rest as ComponentProps<'button'>)}>
      {children}
    </button>
  )
}
