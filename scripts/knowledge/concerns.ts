// F125 / T1017 (#1218) — a ruling's `surfaces=` tags, mapped to the store's
// concerns (and so to departments).
//
// The concerns are the ones #1217 seeds (the brief § Departments and
// concerns), which were themselves drawn from the most used surface tags. A
// ruling's concern is its first surface that maps; its departments are every
// department its mapped surfaces reach, so one ruling read by finance, legal
// and communications stays one record (the brief's stress test "one
// decision, three departments").
//
// A surface missing here maps to nothing: the ruling keeps it as a tag and is
// still found by words. Surfaces about the soul, the method or design tokens
// have no concern on purpose. Agent decision under the decision rights,
// reported in the PR.

export const SURFACE_CONCERN: Record<string, string> = {
  // Building
  explore: 'explore-and-map', map: 'explore-and-map', home: 'explore-and-map', discovery: 'explore-and-map',
  shelves: 'explore-and-map', places: 'explore-and-map', locality: 'explore-and-map', location: 'explore-and-map',
  'page-location': 'explore-and-map', markets: 'explore-and-map', venue: 'explore-and-map',

  pages: 'pages', 'page-publish': 'pages', 'page-edit': 'pages', 'page-photos': 'pages', 'page-create': 'pages',
  'page-settings': 'pages', 'owner-panel': 'pages', 'owner-tools': 'pages', badges: 'pages', verification: 'pages',
  vouching: 'pages', unclaimed: 'pages', claims: 'pages', 'business-registration': 'pages', groups: 'pages',
  membership: 'pages', storefront: 'pages', ownership: 'pages', categories: 'pages', booking: 'pages',
  products: 'pages', contact: 'pages', imports: 'pages', 'default-art': 'pages', edit: 'pages',

  posts: 'posts', posting: 'posts', composer: 'posts', create: 'posts', events: 'posts', rsvp: 'posts',
  gatherings: 'posts', announcements: 'posts', wonders: 'posts', ideas: 'posts', wishes: 'posts',
  recommendations: 'posts', tags: 'posts', follows: 'posts', following: 'posts',

  signup: 'sign-in-and-you', 'sign-up': 'sign-in-and-you', 'sign-in': 'sign-in-and-you', you: 'sign-in-and-you',
  members: 'sign-in-and-you', profile: 'sign-in-and-you', identity: 'sign-in-and-you',
  'member-url': 'sign-in-and-you', 'signed-out': 'sign-in-and-you',

  links: 'sharing-and-links', 'page-url': 'sharing-and-links', 'post-url': 'sharing-and-links',
  'place-url': 'sharing-and-links', 'location-url': 'sharing-and-links', crawlers: 'sharing-and-links',
  attribution: 'sharing-and-links',

  search: 'search-and-ranking', ranking: 'search-and-ranking', ordering: 'search-and-ranking',

  onboarding: 'onboarding', waitlist: 'onboarding', invites: 'onboarding', 'open-your-town': 'onboarding',
  join: 'onboarding',

  uploads: 'uploads', photos: 'uploads',
  notifications: 'notifications',
  ontology: 'ontology', nouns: 'ontology', model: 'ontology', knowledge: 'ontology',

  // Finance
  fees: 'fees-and-income', contributions: 'fees-and-income', payout: 'fees-and-income', backing: 'fees-and-income',
  payments: 'payments', purchases: 'payments', transactions: 'payments',

  // Communications
  copy: 'words-and-voice', voice: 'words-and-voice', names: 'words-and-voice', about: 'words-and-voice',
  email: 'emails',
  landing: 'landing-and-announcements', launch: 'landing-and-announcements', beta: 'landing-and-announcements',
  roadmap: 'landing-and-announcements',

  // Trust and safety
  moderation: 'moderation-and-reports', reports: 'moderation-and-reports', conduct: 'moderation-and-reports',
  safety: 'moderation-and-reports', feedback: 'moderation-and-reports',
  privacy: 'privacy', data: 'privacy', visibility: 'privacy',
  rls: 'security', admin: 'security',

  // Legal
  legal: 'terms', policy: 'terms',
}

/** The department each concern belongs to (#1217's seed). */
export const CONCERN_DEPARTMENT: Record<string, string> = {
  'explore-and-map': 'building', pages: 'building', posts: 'building', 'sign-in-and-you': 'building',
  'sharing-and-links': 'building', 'search-and-ranking': 'building', onboarding: 'building', uploads: 'building',
  notifications: 'building', ontology: 'building',
  'fees-and-income': 'finance', payments: 'finance',
  performance: 'telemetry-and-bugs', 'uptime-and-alerts': 'telemetry-and-bugs', errors: 'telemetry-and-bugs',
  'ci-and-deploys': 'telemetry-and-bugs',
  'words-and-voice': 'communications', emails: 'communications', 'landing-and-announcements': 'communications',
  'moderation-and-reports': 'trust-and-safety', privacy: 'trust-and-safety', security: 'trust-and-safety',
  'child-safety': 'trust-and-safety',
  terms: 'legal', consent: 'legal', 'data-retention': 'legal', 'counsel-open-items': 'legal',
}

/** The absolutes, by slug: the concern each belongs to, where one fits. */
export const ABSOLUTE_CONCERN: Record<string, string | null> = {
  'member-content-takedown': 'moderation-and-reports',
  'member-data-disclosure': 'privacy',
  'production-asks-don': 'ci-and-deploys',
  'public-is-draft': 'words-and-voice',
  'don-decides': null,
  'ruling-is-dated-line': null,
  'newer-decision-wins': null,
  'guard-proves-itself': 'ci-and-deploys',
}

export function placeOf(surfaces: string[]): { concern: string | null; departments: string[] } {
  const concerns = surfaces.map((s) => SURFACE_CONCERN[s]).filter((c): c is string => !!c)
  const departments = [...new Set(concerns.map((c) => CONCERN_DEPARTMENT[c]))]
  return { concern: concerns[0] ?? null, departments }
}
