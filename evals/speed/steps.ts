// #527 — every tap the suite times. Consumer taps first; creator taps are patient.
// READ-ONLY on production: a step opens things (a form, a sheet, a page) and never submits.
import type { Page } from '@playwright/test'
import type { TapKind } from '../../src/lib/speed/judge'

export type Who = 'signedOut' | 'member' | 'ownerBusiness'

export interface Step {
  name: string
  kind: TapKind
  who: Who
  /** Where the tap happens; '@first-page' is the first Page Explore lists. */
  from: string
  /** The element tapped. */
  tap: (page: Page) => ReturnType<Page['locator']>
  /** Visible, with content, when the new screen is usable. */
  ready: string
  /** Still loading while any of these is on screen. */
  notReady?: string[]
  expectsUrl: boolean
  /** Taps made first, untimed, to reach the thing being timed. */
  pre?: (page: Page) => Promise<void>
  /** Tapped by going back instead of an element. */
  back?: true
  /** Skipped, not failed, when the tapped thing is not on the screen (the account may not have one). */
  optional?: true
  /** Consumer steps also run a tap straight after load, before prefetch has settled. */
  quick?: boolean
}

const SKELETON = ['[data-testid="skeleton-card"]', '[aria-busy="true"]']

export const STEPS: Step[] = [
  // ── Consumer, signed out (a visitor from a shared link) ──
  { name: 'Explore card → Page', kind: 'consumer', who: 'signedOut', from: '/explore', tap: (p) => p.locator('[data-testid="tile-card"] a[href^="/g/"], a[href^="/g/"]:has([data-testid="tile-title"])').first(), ready: '[data-testid="page-header"]', notReady: SKELETON, expectsUrl: true, quick: true },
  { name: 'Page → back to Explore', kind: 'consumer', who: 'signedOut', from: '@first-page', tap: (p) => p.locator('body'), back: true, ready: '[data-testid="browse-results"]', notReady: SKELETON, expectsUrl: true, quick: true },
  // Don, 2026-11-01 — the search is the header's pill; Where and More filters are inside it.
  { name: 'Explore: search pill opens', kind: 'consumer', who: 'signedOut', from: '/explore', tap: (p) => p.getByTestId('search-pill'), ready: '[data-testid="search-input"]', expectsUrl: false, quick: true },
  { name: 'Explore: More filters opens sheet', kind: 'consumer', who: 'signedOut', from: '/explore', pre: async (p) => { await p.getByTestId('search-pill').tap(); await p.getByTestId('search-panel').waitFor() }, tap: (p) => p.getByTestId('search-filters'), ready: '[data-testid="filter-sheet-body"]', expectsUrl: false },
  { name: 'Explore: Where opens picker', kind: 'consumer', who: 'signedOut', from: '/explore', pre: async (p) => { await p.getByTestId('search-pill').tap(); await p.getByTestId('search-panel').waitFor() }, tap: (p) => p.getByTestId('search-where'), ready: '[data-testid="scope-sheet"]', expectsUrl: false },
  { name: 'Header → You (signed out)', kind: 'consumer', who: 'signedOut', from: '/explore', tap: (p) => p.getByTestId('app-header').getByRole('link', { name: 'Sign in' }), ready: 'main', notReady: SKELETON, expectsUrl: true },
  // #1171 — follow is Get updates in the Page's ⋯ now.
  { name: 'Page: follow asks you to sign in', kind: 'consumer', who: 'signedOut', from: '@first-page', pre: async (p) => { await p.getByTestId('page-header').getByRole('button', { name: 'More options' }).tap(); await p.getByTestId('page-get-updates').waitFor() }, tap: (p) => p.getByTestId('page-get-updates'), ready: '[data-testid="sign-in-prompt"]', expectsUrl: false, quick: true },
  { name: 'Page: sign in → login screen', kind: 'consumer', who: 'signedOut', from: '@first-page', pre: async (p) => { await p.getByTestId('page-header').getByRole('button', { name: 'More options' }).tap(); await p.getByTestId('page-get-updates').tap(); await p.getByTestId('sign-in-prompt-continue').waitFor() }, tap: (p) => p.getByTestId('sign-in-prompt-continue'), ready: '[data-testid="login-heading"]', expectsUrl: true },
  { name: 'Page: share', kind: 'consumer', who: 'signedOut', from: '@first-page', tap: (p) => p.getByTestId('page-share'), ready: '[data-testid="toast"]', expectsUrl: false },
  { name: 'Page: overflow menu → report', kind: 'consumer', who: 'signedOut', from: '@first-page', tap: (p) => p.getByTestId('page-overflow-menu'), ready: '[role="menu"], [role="dialog"], [data-testid="report-entry"]', expectsUrl: false },
  { name: 'Report: Page menu → report', kind: 'consumer', who: 'signedOut', /* #759: signed out, the tap opens the "Sign in to report this" prompt in place (#704); it no longer navigates. */ from: '@first-page', pre: async (p) => { await p.getByTestId('page-overflow-menu').tap(); await p.getByRole('menuitem', { name: /report this page.s photo/i }).waitFor() }, tap: (p) => p.getByRole('menuitem', { name: /report this page.s photo/i }), ready: '[data-testid="sign-in-prompt-continue"]', notReady: SKELETON, expectsUrl: false },
  { name: 'Waitlist: open from the area picker', kind: 'consumer', who: 'signedOut', from: '/explore', pre: async (p) => { await p.getByTestId('search-pill').tap(); await p.getByTestId('search-where').tap(); await p.getByTestId('scope-sheet').waitFor() }, tap: (p) => p.getByTestId('scope-not-yet-list').locator('button, a').first(), ready: '[data-testid="waitlist-email"], [data-testid="metro-not-covered"]', expectsUrl: false },

  // ── Consumer, signed in as a member ──
  { name: 'Explore post card → Page post', kind: 'consumer', who: 'member', /* #796: posts live behind the Updates filter. */ from: '/explore?view=updates', tap: (p) => p.locator('a[href*="#announcement-"]').first(), ready: '[data-testid="page-post"]', notReady: SKELETON, expectsUrl: true, quick: true },
  { name: 'Explore card → Page (member)', kind: 'consumer', who: 'member', from: '/explore', tap: (p) => p.locator('a[href^="/g/"]:has([data-testid="tile-title"]), [data-testid="tile-card"] a[href^="/g/"]').first(), ready: '[data-testid="page-header"]', notReady: SKELETON, expectsUrl: true, quick: true },
  { name: 'You → Following list', kind: 'consumer', who: 'member', from: '/you', optional: true, tap: (p) => p.locator('a[href="/you/following"]').first(), ready: 'main', notReady: SKELETON, expectsUrl: true },
  { name: 'Explore: ➕ → Show the map', kind: 'consumer', who: 'member', from: '/explore', optional: true, pre: async (p) => { await p.getByTestId('create-menu').tap(); await p.getByTestId('create-menu-list').waitFor() }, tap: (p) => p.getByTestId('create-menu-view'), ready: '[data-testid="browse-map"]', expectsUrl: false },
  { name: 'Header → Explore', kind: 'consumer', who: 'member', from: '/you', tap: (p) => p.getByTestId('app-header').getByRole('link', { name: 'SocialUs' }), ready: '[data-testid="browse-results"]', notReady: SKELETON, expectsUrl: true },
  { name: 'Page: overflow menu → report (member)', kind: 'consumer', who: 'member', from: '@first-page', tap: (p) => p.getByTestId('page-overflow-menu').first(), ready: '[role="menu"], [role="dialog"], [data-testid="report-entry"]', expectsUrl: false },

  // ── Creator and editing (lower priority; open only, never save) ──
  { name: 'Creator: own Page → edit', kind: 'creator', who: 'ownerBusiness', from: '/you', tap: (p) => p.locator('a[href^="/g/"]').first(), ready: '[data-testid="page-header"]', notReady: SKELETON, expectsUrl: true },
  { name: 'Creator: Page edit screen', kind: 'creator', who: 'ownerBusiness', from: '@own-page', tap: (p) => p.getByTestId('owner-bar').locator('a[href$="/edit"]').first(), ready: '[data-testid="edit-name"], [data-testid="edit-header"]', notReady: SKELETON, expectsUrl: true },
  { name: 'Creator: post composer opens', kind: 'creator', who: 'ownerBusiness', from: '@own-page', tap: (p) => p.getByTestId('owner-announce'), ready: '[data-testid="page-post-send"]', expectsUrl: false },
  { name: 'Creator: ➕ offers Propose something', kind: 'creator', who: 'ownerBusiness', from: '/explore', tap: (p) => p.getByTestId('create-menu'), ready: '[data-testid="create-wonder"]', expectsUrl: false },
]
