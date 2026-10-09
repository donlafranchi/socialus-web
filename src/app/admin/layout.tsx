// #544 — everything under /admin is staff only. A member holding no staff
// permission at all gets the 404 of an address that does not exist (each page
// then asks for its own permission). The strip shows only what this member may open.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { staffPermissions } from '@/lib/staff/page-guard'
import type { Permission } from '@/lib/staff/permissions'

const SCREENS: { href: string; label: string; needs: Permission }[] = [
  { href: '/admin/metrics', label: 'Metrics', needs: 'metrics.view' },
  { href: '/admin/reports', label: 'Reports', needs: 'reports.review' },
  { href: '/admin/tags', label: 'Tags', needs: 'tags.review' },
  { href: '/admin/unclaimed', label: 'Unclaimed', needs: 'unclaimed.manage' },
  { href: '/admin/builders', label: 'Builders', needs: 'builders.manage' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { permissions } = await staffPermissions()
  if (permissions.length === 0) notFound()
  const mine = SCREENS.filter((s) => permissions.includes(s.needs))
  return (
    <>
      <nav aria-label="Staff screens" data-testid="admin-nav" className="flex gap-3 overflow-x-auto border-b border-[var(--color-border)] px-3 py-2 text-sm">
        {mine.map((s) => (
          <Link key={s.href} href={s.href} className="whitespace-nowrap underline">
            {s.label}
          </Link>
        ))}
      </nav>
      {children}
    </>
  )
}
