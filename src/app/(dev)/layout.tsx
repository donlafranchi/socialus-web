// Verification route group gate.
//
// Next.js treats `(dev)` as an organizational group: parens do not affect the
// URL, so without this gate `src/app/(dev)/card-gallery` would serve at
// `/card-gallery` on every environment. notFound() intercepts before the page
// body runs.
//
// The rule changed on 2026-09-17. It was `NODE_ENV !== 'development'`, which
// meant these pages rendered on a laptop and 404'd on every Vercel preview —
// every Vercel build, preview included, sets NODE_ENV=production. That is
// backwards for what these pages are for: Don looks at them on his phone,
// away from the machine. Now they render everywhere except production. See
// gate.ts for why the test is equality rather than inequality.

import { notFound } from 'next/navigation'
import { isProductionDeployment } from './gate'

// Load-bearing, and it was missing on the first attempt.
//
// Without this, pages under (dev) are statically prerendered: the layout runs
// once at BUILD time, when VERCEL_ENV is not yet the runtime value, and the
// resulting HTML is served to everyone regardless. Verified — a production-
// shaped runtime served /card-gallery with HTTP 200 until this was added.
//
// The old NODE_ENV gate hid this because it blocked at build time (every build
// has NODE_ENV=production), so the page was never generated at all. Inverting
// the rule without forcing dynamic rendering would have shipped verification
// pages to production, which is the exact failure the gate exists to prevent.
export const dynamic = 'force-dynamic'

export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (isProductionDeployment()) {
    notFound()
  }
  return <>{children}</>
}
