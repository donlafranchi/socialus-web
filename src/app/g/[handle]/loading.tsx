// #555 — a tap on a card is answered at once: the router commits the outline before the server has resolved the Page.
// Without a route-level boundary the navigation waited for `resolvePageById` (about a second on a phone on 4G) before the
// URL changed, and the default prefetch had nothing to fetch for this dynamic route.
import { PageSkeleton } from '@/components/group/PageSkeleton'

export default function Loading() {
  return <PageSkeleton />
}
