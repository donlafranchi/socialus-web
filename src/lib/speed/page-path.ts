// #978 — the Page a link on Explore leads to: /g/<id>, or /<town-st>/<page>[/<post>].
const TOWN = /^[a-z0-9-]+-[a-z]{2}$/

export function pagePathOf(href: string | null): string | null {
  if (!href || !href.startsWith('/') || /[?#]/.test(href)) return null
  const segs = href.split('/').filter(Boolean)
  if (segs[0] === 'g' && segs.length === 2) return href
  if (TOWN.test(segs[0] ?? '') && (segs.length === 2 || segs.length === 3)) return `/${segs[0]}/${segs[1]}`
  return null
}
