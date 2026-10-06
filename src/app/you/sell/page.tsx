// #336 — /you/sell is retired (Don, 2026-10-05): "this is useful stuff but it
// should be product/service based and from a page not from you". It redirects to
// Create. The list-a-product / offer-a-service / host-a-gathering flow is KEPT,
// unrouted, for when product and service listings are due ("let's not throw it
// away"; socialus-plan ROADMAP § Later):
//   src/components/sell/{Product,Service,Gathering}Composer.tsx
//   src/components/sell/Add{Product,Service,Gathering}Button.tsx
//   src/app/you/sell/{product,service,gathering}/actions.ts, ./action-result.ts
//   src/lib/sell/ (purpose.ts, unwrap.ts)
// SellWalkthrough, SellCta and getDraftGroup are the walkthrough Create replaced.

import { redirect } from 'next/navigation'

export default function SellIndexPage() {
  redirect('/create')
}
