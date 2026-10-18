// #921 — a minimal service worker. It exists so the app installs and a page that cannot load shows
// a friendly page. It stores static files only: never a page, the feed, /api/, auth or Supabase
// responses, so nothing about a member or a feed outlives the connection.
const STATIC = 'socialus-static-v1'
const OFFLINE = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC).then((cache) => cache.add(OFFLINE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== STATIC).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

const isStatic = (url) => url.origin === self.location.origin && (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/'))

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  // Pages: always the network; the offline page only when the network fails.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)))
    return
  }
  // Fingerprinted build files and the icons: cache first. /api/ and supabase calls fall through untouched.
  if (isStatic(url)) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(request)
        if (hit) return hit
        const res = await fetch(request)
        if (res.ok) cache.put(url.pathname, res.clone())
        return res
      }),
    )
  }
})
