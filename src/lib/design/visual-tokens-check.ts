// #295 — screens use the design tokens (globals.css), never one-off visual
// values. A one-off is a Tailwind arbitrary value for size, spacing, radius,
// shadow or type (`p-[13px]`, `rounded-[10px]`, `text-[15px]`), or a px/rem
// length in an inline style. Colour is out of scope (Don, 2026-10-01).
//
// A ratchet, not a cleanup: the values already in the tree are listed in
// visual-tokens-baseline.json, each removed as its screen moves to the new
// templates. A value not in the baseline fails; so does a baseline entry the
// tree no longer has, so the list only shrinks.

const PROPS =
  '-?(?:p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y|w|h|size|min-w|min-h|max-w|max-h|' +
  'top|left|right|bottom|inset|inset-x|inset-y|rounded|rounded-[tblr]|rounded-[tb][lr]|shadow|text|leading|tracking|' +
  'translate-x|translate-y|basis)'

/** Arbitrary Tailwind values, minus colour. */
const CLASS = new RegExp(`(?<![\\w-])(${PROPS})-\\[([^\\]\\s]+)\\]`, 'g')
const COLOUR = /^(var\(--color-|#|rgb|hsl|color:)/
/** px/rem lengths in an inline style object or cssText. */
const INLINE = /(?<![-\w])(padding|margin|fontSize|font-size|borderRadius|border-radius|boxShadow|box-shadow|gap|width|height|top|left|right|bottom)[A-Za-z-]*:\s*['"`]?(-?\d+(?:\.\d+)?(?:px|rem))/g

export type Baseline = Record<string, string[]>

export function oneOffs(source: string): string[] {
  const found: string[] = []
  for (const m of source.matchAll(CLASS)) {
    if (m[1] === 'text' && COLOUR.test(m[2]!)) continue
    found.push(m[0])
  }
  for (const m of source.matchAll(INLINE)) found.push(`${m[1]}:${m[2]}`)
  return found.sort()
}

export interface Violation {
  file: string
  value: string
  kind: 'new one-off' | 'stale baseline entry'
}

/** Compares the tree (file → source) with the baseline, count by count. */
export function checkVisualTokens(files: Record<string, string>, baseline: Baseline): Violation[] {
  const out: Violation[] = []
  const all = new Set([...Object.keys(files), ...Object.keys(baseline)])
  for (const file of [...all].sort()) {
    const have = files[file] === undefined ? [] : oneOffs(files[file]!)
    const allowed = [...(baseline[file] ?? [])]
    for (const v of have) {
      const i = allowed.indexOf(v)
      if (i >= 0) allowed.splice(i, 1)
      else out.push({ file, value: v, kind: 'new one-off' })
    }
    for (const v of allowed) out.push({ file, value: v, kind: 'stale baseline entry' })
  }
  return out
}
