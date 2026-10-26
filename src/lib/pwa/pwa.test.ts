import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import manifest from '@/app/manifest'
import { config } from '@/proxy'

// #921 — SocialUs installs to the home screen.
const ROOT = join(__dirname, '../../..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('the web app manifest', () => {
  const m = manifest()
  it('opens standalone on Explore, scoped to the whole site, in the palette', () => {
    expect(m).toMatchObject({ name: 'SocialUs', short_name: 'SocialUs', display: 'standalone', start_url: '/explore', scope: '/', theme_color: '#12233a', background_color: '#ffffff' })
  })
  it('has 192, 512 and a maskable 512 icon', () => {
    const icons = m.icons ?? []
    expect(icons.some((i) => i.sizes === '192x192' && i.type === 'image/png')).toBe(true)
    expect(icons.some((i) => i.sizes === '512x512' && (i.purpose ?? 'any') === 'any')).toBe(true)
    expect(icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true)
  })
})

describe('the service worker', () => {
  const sw = read('public/sw.js')
  it('answers a page that cannot load with the offline page', () => {
    expect(sw).toContain('/offline.html')
  })
  it('caches static assets only: never the feed, an API, auth or a member page', () => {
    expect(sw).toContain('/_next/static/')
    expect(sw).toMatch(/request\.method !== 'GET'/)
    expect(sw).not.toMatch(/cache\.put\(request/) // a navigation or data response is never stored
    expect(sw).toMatch(/\/api\/|supabase/) // named as excluded
  })
  // #904 — web push handlers live in their own file, loaded first.
  it('loads the push handlers', () => {
    expect(sw).toMatch(/^importScripts\('\/push-sw\.js'\)/m)
    expect(read('public/push-sw.js')).toMatch(/addEventListener\('push'[\s\S]*addEventListener\('notificationclick'/)
  })
})

describe('the proxy leaves the install files alone', () => {
  const skipped = (path: string) => !new RegExp(`^${config.matcher[0]}$`).test(path)
  it.each(['/manifest.webmanifest', '/sw.js', '/push-sw.js', '/offline.html', '/icons/192'])('%s', (p) => {
    expect(skipped(p)).toBe(true)
  })
  it('still guards /explore', () => expect(skipped('/explore')).toBe(false))
})

describe('iOS standalone meta', () => {
  const layout = read('src/app/layout.tsx')
  it('asks for a web app, the status bar and the theme colour', () => {
    expect(layout).toContain('apple-mobile-web-app-capable')
    expect(layout).toMatch(/statusBarStyle/)
    expect(layout).toMatch(/themeColor/)
  })
})
