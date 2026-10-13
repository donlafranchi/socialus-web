// #555 — prefetch only pays if the router keeps what it prefetched. In Next 15 and 16 a dynamic page's prefetch is
// discarded at once unless staleTimes says otherwise, so a card's prefetch (on view, hover or a finger resting) would
// be thrown away before the tap. 30 seconds keeps it; a server action that changes data refreshes the router itself.

import { describe, it, expect } from 'vitest'
import nextConfig from '../../../next.config'

describe('the router cache', () => {
  // [guards F059 partial: a card's prefetch survives until the tap (#555)]
  it('keeps a prefetched dynamic page for 30 seconds, and a static one for 3 minutes', () => {
    const st = (nextConfig as { experimental?: { staleTimes?: { dynamic?: number; static?: number } } }).experimental?.staleTimes
    expect(st?.dynamic).toBe(30)
    expect(st?.static).toBe(180)
  })
})
