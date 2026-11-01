// #1139 (Don, 2026-11-01) — words no place, Page or post slug may take: every top-level route, the old address
// markers, and a post's own sub-paths. The database's url_reserved() holds the same list; a test compares them and
// fails when a new top-level route is not here.
export const RESERVED_WORDS: readonly string[] = [
  'about', 'add-entity-demo', 'admin', 'api', 'apple-icon', 'auth', 'business', 'card-gallery', 'composer-demo',
  'create', 'edit', 'explore', 'favicon', 'following', 'fonts', 'g', 'icons', 'join', 'landing', 'm', 'manifest',
  'map', 'offline', 'og-default', 'onboarding', 'open', 'p', 'playground', 'posts', 'privacy', 'push-sw', 'qr',
  'register-business', 'report', 'robots', 'rules', 'sitemap', 'storage', 'sw', 'terms', 'unclaimed-demo',
  'welcome', 'you',
]
