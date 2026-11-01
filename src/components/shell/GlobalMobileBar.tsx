'use client'

// #1141 — the phone bar everywhere but Explore (which renders its own, wired to its results).
// Here the field sends the words to Explore.

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { MobileBar } from './MobileBar'
import { navHidden } from './nav-hidden'

export function GlobalMobileBar() {
  const pathname = usePathname() ?? '/'
  const router = useRouter()
  const [query, setQuery] = useState('')
  if (navHidden(pathname) || pathname.startsWith('/explore')) return null
  return (
    <MobileBar
      query={query}
      onQueryChange={setQuery}
      onSubmit={(q) => router.push(q.trim() ? `/explore?q=${encodeURIComponent(q.trim())}` : '/explore')}
    />
  )
}
