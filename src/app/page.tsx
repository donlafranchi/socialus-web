// `/` is the signed-out front door (2026-10-26). A signed-in member never sees
// it: the proxy sends them to Explore, so this page reads no session and stays
// static. Look: Don's concept (2026-10-31) — warm off-white, terracotta, sage,
// a dark footer — set in Family Type's Aime, Don's pick (2026-10-31). Words: the
// one line (2026-11-06), the same pitch as /join.

import { Landing } from '@/components/landing/Landing'

export default function HomeLanding() {
  return <Landing />
}
