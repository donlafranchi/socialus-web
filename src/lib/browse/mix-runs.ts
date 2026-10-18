// #897 — Explore never shows more than 2 in a row sharing a category, so a day's
// theme batch (museums, historical societies…) doesn't sit together. Order only.
export const MAX_RUN = 2

export interface MixRunsOptions<T> {
  tags: (item: T) => readonly string[]
  /** Fixed in relative order; only movable rows are pulled forward to break a run. */
  movable: (item: T) => boolean
}

function shared(a: Set<string>, b: Set<string>, c: Set<string>): boolean {
  for (const t of a) if (b.has(t) && c.has(t)) return true
  return false
}

type Keyed<T> = { item: T; tags: Set<string> }

/**
 * Stable: keeps the order unless a third in a row would share a tag. A forward pass, then a
 * backward one for a run left at the tail once the forward pass spent the rows between.
 */
export function mixRuns<T>(items: readonly T[], opts: MixRunsOptions<T>): T[] {
  const keyed = items.map((item) => ({ item, tags: new Set(opts.tags(item).map((t) => t.trim().toLowerCase()).filter(Boolean)) }))
  const forward = pass(keyed, opts)
  return pass(forward.reverse(), opts).reverse().map((r) => r.item)
}

function pass<T>(rows: Keyed<T>[], opts: MixRunsOptions<T>): Keyed<T>[] {
  const rest = [...rows]
  const out: Keyed<T>[] = []
  while (rest.length) {
    let pick = 0
    const a = out[out.length - 1]
    const b = out[out.length - 2]
    if (a && b && shared(rest[0]!.tags, a.tags, b.tags)) {
      const j = rest.findIndex((r, i) => i > 0 && opts.movable(r.item) && !shared(r.tags, a.tags, b.tags))
      if (j > 0) pick = j
    }
    out.push(rest.splice(pick, 1)[0]!)
  }
  return out
}
