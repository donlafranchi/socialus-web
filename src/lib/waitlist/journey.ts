// #1298, #1299 — the waitlist landing and join journey (F076.3, F076.18; brief approved by the PM 2026-11-13).
// One question per screen, each at its own address under /join/. Every word here is placeholder for the PM's
// copywriter ([public-is-draft]); every `image` is an empty slot for the copywriter's art, with the brief's note.

// [open-question owner=don raised=2026-11-13] The landing headline: A "SocialUs, for the people." (recommended), B "SocialUs, a platform for the people.", C "SocialUs, by the people, for the people.", or #1272's "Locals, finding and supporting locals."
export const LANDING_HEADLINE = '[Headline: the PM picks]'

export const LANDING = {
  line: 'A place for locals to find and support locals, wherever you are, wherever you go.',
  join: 'Join the waitlist',
  look: 'Look around',
  lookHref: '/explore',
  image: 'Locals at a busy street market, warm, real faces',
}

export const PLANS = {
  discover: [
    { id: 'find-businesses', label: 'Find local businesses and makers' },
    { id: 'find-groups', label: 'Find groups and meetups' },
    { id: 'find-events', label: 'Find events and classes' },
  ],
  found: [
    { id: 'have-business', label: 'I have a business, shop or stall' },
    { id: 'make-sell', label: 'I make or sell things' },
    { id: 'teach', label: 'I teach a class' },
    { id: 'organize', label: 'I organize a group or meetup' },
  ],
} as const

export const KINDS = ['Food and drink', 'Shop or market stall', 'Maker or artist', 'Classes and lessons', 'Services', 'Groups and meetups', 'Events'] as const

export const FOUND_IDS: readonly string[] = PLANS.found.map((p) => p.id)
export const PLAN_IDS: readonly string[] = [...PLANS.discover, ...PLANS.found].map((p) => p.id)

/** Being found on any chip puts the person on the makers' side of the count; otherwise the supporters'. */
export const sideOf = (plans: readonly string[]): 'creator' | 'patron' => (plans.some((p) => FOUND_IDS.includes(p)) ? 'creator' : 'patron')

export const STEPS = ['local', 'plans', 'be-found', 'kind', 'called', 'name', 'zip', 'email', 'phone', 'done'] as const
export type Step = (typeof STEPS)[number]
export const isStep = (s: string): s is Step => (STEPS as readonly string[]).includes(s)

const FOUND_ONLY: readonly Step[] = ['be-found', 'kind', 'called']
export const OPTIONAL: readonly Step[] = ['kind', 'called']

/** The screens this person walks, given their plans: the being-found screens only when a being-found chip is picked. */
export function pathFor(plans: readonly string[]): Step[] {
  const found = sideOf(plans) === 'creator'
  return STEPS.filter((s) => found || !FOUND_ONLY.includes(s))
}

export const href = (s: Step | 'start') => (s === 'start' ? '/join/waitlist' : `/join/${s}`)

export function neighbours(step: Step, plans: readonly string[]): { back: string; next: string | null } {
  const path = pathFor(plans)
  const i = path.indexOf(step)
  return {
    back: i <= 0 ? href('start') : href(path[i - 1]),
    next: i < 0 || i >= path.length - 1 ? null : href(path[i + 1]),
  }
}

export const SEGMENTS = 10

/**
 * Filled segments: fast at the start, slower toward the end (Villar et al., 32 experiments), and no step count,
 * since branching changes it. 1 - (1 - x)^2 of the way after each answered screen; the finish fills it.
 */
export function filled(step: Step, plans: readonly string[]): number {
  const path = pathFor(plans)
  const i = Math.max(0, path.indexOf(step))
  const x = (i + 1) / path.length
  return Math.min(SEGMENTS, Math.max(1, Math.round((1 - (1 - x) ** 2) * SEGMENTS)))
}

export type Screen = { title: string; body?: string; image: string; cta?: string }

export const SCREENS: Record<Step, Screen> = {
  local: {
    title: 'Everything local, in one place',
    body: 'The bakery, the run club, Saturday’s market, the pottery class. Find what’s happening near you.',
    image: 'A phone-sized collage of local shops, a class, a meetup',
  },
  plans: { title: 'What would you like to do here?', body: 'Pick as many as you like.', image: 'Two hands meeting across a market table' },
  'be-found': { title: 'Locals can find you', body: 'People nearby can find what you make, teach or organize.', image: 'A maker at work, seen from a customer’s side' },
  kind: { title: 'What kind of thing do you do?', image: 'Small icons per kind, hand-drawn' },
  called: { title: 'What’s it called, and where can we see it?', image: 'A shopfront sign being hung' },
  name: { title: 'What should we call you?', body: 'Your first name, or the name people know you by.', image: 'A name tag at a neighbourhood table' },
  zip: { title: 'Where are you?', body: 'We open town by town. Your zip counts toward yours.', image: 'A simple map with one town lit' },
  email: { title: 'Where should we send your invite?', body: 'We’ll email you once, when SocialUs opens near you. Nothing else.', image: 'An envelope tucked under a café door' },
  phone: {
    title: 'Your mobile number',
    body: 'Your mobile number keeps out bots and spam. Only real cell numbers work, not internet numbers.',
    image: 'A phone in a hand, outdoors',
    cta: 'Join the waitlist',
  },
  done: { title: 'You’re on the list', image: 'The same market, a little fuller' },
}

export const SAFETY = {
  line: 'SocialUs is a place where we look out for one another.',
  more: 'Your number is tied to everything you post. Illegal content is reported to police.',
}

export const ERRORS = {
  plans: 'Pick at least one.',
  name: 'Tell us what to call you.',
  zip: 'We don’t recognize that zip, try again.',
  email: 'That doesn’t look like an email.',
  phone: 'That doesn’t look like a mobile number.',
  failed: 'Something went wrong. Please try again.',
}

export const doneLines = (market: string, waiting: number | null) => [
  `You’re on the list for ${market}.`,
  waiting === null
    ? 'When enough makers and neighbours join, we can open.'
    : `${waiting.toLocaleString('en-US')} ${waiting === 1 ? 'local is' : 'locals are'} waiting there. When enough makers and neighbours join, we can open.`,
]

export const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
export const ZIP_SHAPE = /^\d{5}$/

/** Any US format; nothing is checked with a carrier here (F076.18). Returns E.164 or null. */
export function phoneE164(raw: string): string | null {
  const d = raw.replace(/\D/g, '')
  const ten = d.length === 11 && d.startsWith('1') ? d.slice(1) : d
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(ten) ? `+1${ten}` : null
}
