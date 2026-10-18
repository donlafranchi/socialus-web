// #904 — web push handlers. The PWA's service worker loads these with importScripts('/push-sw.js').
// A push carries { kind, title, body, url, tag } (src/lib/notify/push/rules.ts). Tapping it opens url, which
// carries ?via=push-<kind> so the landing screen can count the open and offer one tap to turn the kind off.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  const title = data.title || 'SocialUs'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag || data.kind || 'socialus',
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin)
  if (url.origin !== self.location.origin) return
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => 'navigate' in w)
      if (win) return win.navigate(url.href).then((w) => (w || win).focus())
      return self.clients.openWindow(url.href)
    }),
  )
})

