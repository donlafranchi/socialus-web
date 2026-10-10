// #556 — what a business's own homepage tells us, read from its HTML: pictures to try (best
// first), a phone number, and the social profiles it links. Pure: the caller fetches the HTML.

export interface SiteMeta {
  images: string[]
  phone: string | null
  social: Partial<Record<'instagram' | 'facebook' | 'tiktok' | 'x' | 'youtube', string>>
}

const NOT_A_PHOTO = /logo|icon|favicon|sprite|avatar|placeholder|spacer|pixel|badge|button|payment|visa|mastercard|paypal|arrow|star|rating|flag|qr|banner-ad|\.svg|\.gif|\.ico|data:image|gravatar|emoji|loading|blank/i

const attr = (tag: string, name: string): string | null => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return m ? (m[2] ?? m[3] ?? m[4] ?? null) : null
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#38;/g, '&').replace(/&quot;/g, '"').replace(/&#x2F;/gi, '/')

function absolute(u: string | null, base: string): string | null {
  if (!u) return null
  try {
    const x = new URL(decode(u.trim()), base)
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href.replace(/^http:/, 'https:') : null
  } catch {
    return null
  }
}

/** The widest candidate of an srcset, or null. */
function widest(srcset: string | null): string | null {
  if (!srcset) return null
  const parts = srcset.split(',').map((p) => p.trim().split(/\s+/)).filter((p) => p[0])
  parts.sort((a, b) => (parseInt(b[1] ?? '0', 10) || 0) - (parseInt(a[1] ?? '0', 10) || 0))
  return parts[0]?.[0] ?? null
}

/** US numbers only, as the groups.contact_phone check wants them: +1 then ten digits, area code 2–9. */
export function normaliseUsPhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  return /^[2-9]\d{9}$/.test(ten) ? `+1${ten}` : null
}

const SOCIAL: [keyof SiteMeta['social'], RegExp][] = [
  ['instagram', /^https:\/\/(www\.)?instagram\.com\/(?!p\/|reel|explore|accounts|share)[A-Za-z0-9._]{2,30}\/?$/i],
  ['facebook', /^https:\/\/(www\.)?facebook\.com\/(?!sharer|share|dialog|tr\b|plugins|login|policies|groups\/|events\/)[A-Za-z0-9._-]{3,80}\/?$/i],
  ['tiktok', /^https:\/\/(www\.)?tiktok\.com\/@[A-Za-z0-9._]{2,30}\/?$/i],
  ['youtube', /^https:\/\/(www\.)?youtube\.com\/(@[A-Za-z0-9._-]{2,40}|c\/[A-Za-z0-9._-]+|channel\/[A-Za-z0-9_-]+)\/?$/i],
  ['x', /^https:\/\/(www\.)?(x|twitter)\.com\/(?!intent|share|home)[A-Za-z0-9_]{2,15}\/?$/i],
]

export function extractSiteMeta(html: string, baseUrl: string): SiteMeta {
  const images: string[] = []
  const push = (u: string | null) => {
    const a = absolute(u, baseUrl)
    if (a && !NOT_A_PHOTO.test(a) && !images.includes(a)) images.push(a)
  }

  // Declared pictures first: they are the ones the business chose to show the world.
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attr(tag, 'property') ?? attr(tag, 'name') ?? '').toLowerCase()
    if (['og:image', 'og:image:secure_url', 'og:image:url', 'twitter:image', 'twitter:image:src'].includes(key)) push(attr(tag, 'content'))
  }
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if ((attr(tag, 'rel') ?? '').toLowerCase() === 'image_src') push(attr(tag, 'href'))
  }
  for (const block of html.match(/<script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) ?? []) {
    const body = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '')
    for (const m of body.matchAll(/"image"\s*:\s*(\[[^\]]*\]|"[^"]+"|\{[^}]*\})/g)) {
      for (const u of m[1]!.match(/https?:\\?\/\\?\/[^"\\]+(?:\\\/[^"\\]*)*/g) ?? []) push(u.replace(/\\\//g, '/'))
    }
  }

  // Then the pictures on the page itself, skipping icons, logos, badges and anything declared small.
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const w = parseInt(attr(tag, 'width') ?? '', 10)
    const h = parseInt(attr(tag, 'height') ?? '', 10)
    if ((w && w < 300) || (h && h < 200)) continue
    const cls = `${attr(tag, 'class') ?? ''} ${attr(tag, 'alt') ?? ''}`
    if (/logo|icon|avatar/i.test(cls)) continue
    push(widest(attr(tag, 'srcset')) ?? widest(attr(tag, 'data-srcset')) ?? attr(tag, 'data-src') ?? attr(tag, 'data-lazy-src') ?? attr(tag, 'src'))
  }

  let phone: string | null = null
  for (const m of html.matchAll(/href\s*=\s*["']tel:([^"']+)["']/gi)) {
    phone = normaliseUsPhone(decodeURIComponent(m[1]!))
    if (phone) break
  }
  if (!phone) {
    const m = html.match(/"telephone"\s*:\s*"([^"]+)"/i)
    phone = normaliseUsPhone(m?.[1])
  }

  const social: SiteMeta['social'] = {}
  for (const m of html.matchAll(/href\s*=\s*["'](https?:\/\/[^"']+)["']/gi)) {
    const u = decode(m[1]!).replace(/^http:/, 'https:').split(/[?#]/)[0]!
    for (const [k, re] of SOCIAL) if (!social[k] && re.test(u)) social[k] = u.replace(/\/$/, '')
  }
  return { images, phone, social }
}
