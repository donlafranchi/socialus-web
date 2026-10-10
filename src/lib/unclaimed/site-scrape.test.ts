import { describe, it, expect } from 'vitest'
import { extractSiteMeta, normaliseUsPhone } from './site-scrape'

const HTML = `<html><head>
<meta property="og:image" content="/cdn/hero.jpg?v=2&amp;w=1200">
<meta name="twitter:image" content="https://cdn.example.com/card.jpg">
<script type="application/ld+json">{"@type":"Bakery","telephone":"(916) 555-0142","image":["https://example.com/a.jpg","https://example.com/b.jpg"]}</script>
</head><body>
<img src="/img/logo.png" alt="logo"><img src="/img/tiny.jpg" width="40" height="40">
<img src="/img/shop.jpg" srcset="/img/shop-400.jpg 400w, /img/shop-1600.jpg 1600w">
<img data-src="/img/cake.jpg" class="lazy">
<a href="tel:+1-916-555-0142">Call</a>
<a href="https://www.instagram.com/examplebakery/?hl=en">ig</a><a href="https://www.facebook.com/sharer/sharer.php?u=x">share</a>
<a href="https://www.facebook.com/ExampleBakery/">fb</a><a href="https://www.instagram.com/p/abc/">post</a>
</body></html>`

describe('extractSiteMeta (#556)', () => {
  const m = extractSiteMeta(HTML, 'https://example.com/')
  it('puts the declared pictures first, absolute and https', () => {
    expect(m.images.slice(0, 2)).toEqual(['https://example.com/cdn/hero.jpg?v=2&w=1200', 'https://cdn.example.com/card.jpg'])
    expect(m.images).toContain('https://example.com/a.jpg')
  })
  it('then the pictures on the page, widest srcset entry, lazy sources too', () => {
    expect(m.images).toContain('https://example.com/img/shop-1600.jpg')
    expect(m.images).toContain('https://example.com/img/cake.jpg')
  })
  it('leaves out logos and anything declared small', () => {
    expect(m.images.some((u) => /logo|tiny/.test(u))).toBe(false)
  })
  it('reads the phone as +1 and ten digits', () => {
    expect(m.phone).toBe('+19165550142')
  })
  it('keeps real profiles and drops share links and single posts', () => {
    expect(m.social).toEqual({ instagram: 'https://www.instagram.com/examplebakery', facebook: 'https://www.facebook.com/ExampleBakery' })
  })
})

describe('normaliseUsPhone', () => {
  it.each([['(916) 555-0142', '+19165550142'], ['1-916-555-0142', '+19165550142'], ['+1 916 555 0142', '+19165550142'], ['555-0142', null], ['011-44-20-7946-0958', null], ['(116) 555-0142', null]])('%s', (i, o) => {
    expect(normaliseUsPhone(i)).toBe(o)
  })
})
