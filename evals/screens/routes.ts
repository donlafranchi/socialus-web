// #269 — every routed screen in the 2026-10-01 screen inventory
// (socialus-owner-page-design/socialus-screen-inventory.xlsx, "Screens"),
// resolved to a concrete URL for a given persona against the persona seed.
//
// Left out: /api/* (no screen), and the two unrouted components (HomeFeed,
// LocalityFeed), which no URL reaches. A state that needs a tap (the map view)
// is its own entry with an `act`.

import type { Page } from '@playwright/test'
import { PAGES, pageHandle, page as seeded, persona, type Persona } from '../personas'

export interface ScreenRoute {
  /** File-safe name; the screenshot is <width>/<persona>/<name>.png. */
  name: string
  /** Inventory IDs this covers. */
  inventory: string[]
  path: (who: Persona) => string
  act?: (page: Page) => Promise<void>
  /** The same screen whoever is looking: a redirect, a not-found, a demo, the sign-in pages. */
  same?: true
}

const PLACE = 'ca/sacramento/oak-park'
const business = seeded('business')
const interest = seeded('interest')
const family = seeded('family')
const member = persona('member')

/** An owner sees their own Page; everyone else the interest Page. */
const pageFor = (who: Persona) => PAGES.find((p) => p.key === who.owns) ?? interest

// Item URL fragments are the first 8 characters of the seeded item ids.
const GATHERING = (i: number) => `meetup-0d000000`.replace('meetup', `${PAGES[i]!.slug}-meetup`)
const SOLO = { p: 'jar-of-plum-jam-0d000000', s: 'bike-tune-up-0d000000', e: 'porch-music-night-0d000000' }

export const ROUTES: ScreenRoute[] = [
  { name: 'root', inventory: ['S007'], path: () => '/' },
  { name: 'explore', inventory: ['S008', 'S009', 'S010', 'S016', 'S017'], path: () => '/explore' },
  {
    name: 'explore-map',
    inventory: ['S012', 'S013'],
    path: () => '/explore',
    act: async (page) => {
      // Under 1024px the pill switches to the map; wider, the map is already beside the list.
      const pill = page.getByTestId('view-pill')
      if (await pill.isVisible().catch(() => false)) await pill.click()
    },
  },
  { name: 'following', inventory: ['S022', 'S023', 'S027', 'S095', 'S096'], path: () => '/following' },
  { name: 'page', inventory: ['S028', 'S029', 'S030', 'S033', 'S034', 'S036'], path: (who) => `/g/${pageHandle(pageFor(who))}` },
  { name: 'page-business', inventory: ['S028', 'S029', 'S030'], path: () => `/g/${pageHandle(business)}` },
  { name: 'page-private', inventory: ['S031', 'S037'], path: () => `/g/${pageHandle(family)}` },
  { name: 'page-not-found', inventory: ['S037'], path: () => '/g/no-such-page-zzzzzz', same: true },
  { name: 'page-stale-handle', inventory: ['S038'], path: () => `/g/old-name-${interest.publicId}`, same: true },
  { name: 'page-posts', inventory: [], path: (who) => `/g/${pageHandle(pageFor(who))}/posts` },
  { name: 'page-edit', inventory: ['S097', 'S098', 'S099', 'S100'], path: (who) => `/g/${pageHandle(pageFor(who))}/edit` },
  { name: 'join', inventory: ['S039', 'S040'], path: () => '/join' },
  { name: 'member-profile', inventory: ['S041', 'S042', 'S043', 'S044', 'S045'], path: (who) => `/m/${who.handle ?? member.handle}` },
  { name: 'member-product', inventory: ['S047'], path: () => `/m/${member.handle}/p/${SOLO.p}` },
  { name: 'member-service', inventory: ['S048'], path: () => `/m/${member.handle}/s/${SOLO.s}` },
  { name: 'member-gathering', inventory: ['S046'], path: () => `/m/${member.handle}/e/${SOLO.e}` },
  { name: 'member-item-not-found', inventory: ['S049'], path: () => `/m/${member.handle}/p/nothing-00000000`, same: true },
  { name: 'place', inventory: ['S050'], path: () => `/p/${PLACE}` },
  { name: 'place-not-found', inventory: ['S051'], path: () => '/p/ca/nowhere-at-all', same: true },
  { name: 'place-page-redirect', inventory: ['S052'], path: () => `/p/${PLACE}/g/${interest.slug}`, same: true },
  { name: 'page-gathering', inventory: ['S053'], path: () => `/p/${PLACE}/g/${business.slug}/e/${GATHERING(0)}` },
  { name: 'page-product', inventory: ['S054'], path: () => `/p/${PLACE}/g/${business.slug}/p/country-sourdough-loaf-0d000000` },
  { name: 'page-service', inventory: ['S055'], path: () => `/p/${PLACE}/g/${business.slug}/s/bread-baking-lesson-0d000000` },
  { name: 'page-item-not-found', inventory: ['S060'], path: () => `/p/${PLACE}/g/${business.slug}/p/nothing-00000000`, same: true },
  { name: 'venue', inventory: ['S056', 'S057', 'S058'], path: () => `/p/${PLACE}/l/${business.locationSlug}` },
  { name: 'venue-not-found', inventory: ['S059'], path: () => `/p/${PLACE}/l/no-such-venue`, same: true },
  { name: 'admin-reports', inventory: ['S073', 'S074', 'S075', 'S076'], path: () => '/admin/reports' },
  { name: 'auth-login', inventory: ['S082', 'S083', 'S084', 'S085'], path: () => '/auth/login', same: true },
  { name: 'auth-password', inventory: ['S086', 'S087', 'S088', 'S089', 'S090'], path: () => '/auth/password', same: true },
  { name: 'auth-signup-redirect', inventory: ['S091'], path: () => '/auth/signup', same: true },
  { name: 'business-redirect', inventory: ['S092'], path: () => `/business/${business.slug}`, same: true },
  { name: 'manage-redirect', inventory: ['S101'], path: () => `/manage/${business.slug}`, same: true },
  { name: 'map-redirect', inventory: ['S102'], path: () => '/map', same: true },
  { name: 'qr-redirect', inventory: ['S109'], path: () => '/qr', same: true },
  { name: 'register-business-redirect', inventory: ['S110'], path: () => '/register-business', same: true },
  { name: 'onboarding', inventory: ['S103', 'S104', 'S105', 'S106', 'S107', 'S108'], path: () => '/onboarding' },
  { name: 'you', inventory: ['S111', 'S112', 'S113', 'S114', 'S115', 'S116', 'S118', 'S126'], path: () => '/you' },
  { name: 'you-following-tab', inventory: ['S150'], path: () => '/you?tab=following' },
  { name: 'you-saved-tab', inventory: ['S151'], path: () => '/you?tab=saved' },
  { name: 'you-settings-tab', inventory: ['S152'], path: () => '/you?tab=settings' },
  { name: 'you-following', inventory: ['S128', 'S129', 'S130', 'S131'], path: () => '/you/following' },
  { name: 'you-sell', inventory: ['S132', 'S133', 'S135', 'S139', 'S143', 'S149'], path: () => '/you/sell' },
  { name: 'card-gallery', inventory: ['S093'], path: () => '/card-gallery', same: true },
  { name: 'playground', inventory: [], path: () => '/playground', same: true },
  { name: 'composer-demo', inventory: ['S094'], path: () => '/composer-demo', same: true },
  { name: 'add-entity-demo', inventory: ['S072'], path: () => '/add-entity-demo', same: true },
]

export const WIDTHS = [390, 744, 1024, 1280, 1440, 1920] as const

/**
 * SCREENS_SCOPE=smoke, what every PR runs (ci.yml): every route signed out, and
 * every route that differs by viewer as a member and an owner, at the phone
 * width. A server error is the same at any width; the whole matrix, every
 * width, runs nightly.
 */
export const SMOKE = { widths: [390], signedIn: ['member', 'ownerBusiness'] }
