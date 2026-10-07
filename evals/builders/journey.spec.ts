// #346 — builder journeys. Each Page kind's builder account signs in, creates
// today's new organizations from the roster the way a person would (by visible
// labels, so where it gets lost is friction, not a crash), fills in every
// field, publishes, posts an announcement and an event, then keeps the
// organizations it already runs active. A last pass follows the other
// builders' Pages and looks for a way to RSVP.
//
// Runs one kind at a time (build rules). Locally against the local stack with
// builder accounts provisioned there; daily against production from
// builders-daily.yml. Builder content is invisible to real members (#280).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { builderEmail, builderPassword } from '../../src/lib/builders/credentials'
import { ROSTER, BUILDER_FOR, photoFor, todaysNew, postFor, type BuilderKind, type Org, type Post } from './roster'
import { Journey, recordPage, knownPages } from './run-log'

const SEED = process.env.BUILDER_SEED ?? ''
const TEMPLATE = process.env.BUILDER_EMAIL_TEMPLATE || undefined
const PER_KIND = Number(process.env.BUILDER_NEW_PER_KIND ?? 2)
const DAY = Math.floor(Date.now() / 86_400_000)

test.describe.configure({ mode: 'serial' })
test.skip(!SEED, 'BUILDER_SEED is not set')

const KIND_QUESTION: Record<BuilderKind, RegExp> = {
  business: /sell products or services/i,
  interest: /group or meetup/i,
  practice: /teach a class/i,
}

async function signIn(page: Page, kind: BuilderKind) {
  const persona = BUILDER_FOR[kind]
  await page.goto('/auth/password')
  await page.getByTestId('email-input').fill(builderEmail(persona, TEMPLATE))
  await page.getByTestId('submit-button').click()
  await page.getByTestId('password-input').fill(builderPassword(SEED, persona))
  await page.getByTestId('submit-button').click()
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 30_000 })
}

/** The builder's own Pages, by name, from You. */
async function ownPages(page: Page): Promise<Map<string, string>> {
  await page.goto('/you')
  const own = new Map<string, string>()
  await page.getByTestId('you-page').waitFor()
  for (const a of await page.locator('[data-testid="own-page-live"], [data-testid="own-page-draft"]').all()) {
    const name = (await a.getAttribute('title')) ?? (await a.innerText()).split('\n')[0]!.trim()
    const href = (await a.getAttribute('href')) ?? (await a.locator('a').first().getAttribute('href')) ?? ''
    if (name) own.set(name, href)
  }
  return own
}

async function photoFile(page: Page, org: Org, which: 'cover' | 'post'): Promise<string> {
  const res = await page.request.get(photoFor(org.key)[which].url)
  expect(res.ok()).toBeTruthy()
  const path = join(mkdtempSync(join(tmpdir(), 'builder-')), `${org.key}-${which}.jpg`)
  writeFileSync(path, await res.body())
  return path
}

const dateIn = (days: number) => {
  const d = new Date(Date.now() + days * 86_400_000)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
}

async function post(page: Page, j: Journey, p: Post, label: string) {
  await j.step(label, p.when ? 'Posted an event, with a date and time' : 'Posted an announcement', async () => {
    const box = page.getByPlaceholder('What do you want people to know?')
    await box.scrollIntoViewIfNeeded()
    await box.fill(p.body)
    if (p.when) {
      await page.getByTestId('announce-add-when').click()
      await page.getByTestId('announce-date').fill(dateIn(p.when.inDays))
      await page.getByTestId('announce-time').fill(p.when.start)
      if (p.when.end) await page.getByTestId('announce-end-time').fill(p.when.end)
    }
    await page.getByTestId('page-post-send').click()
    await expect(page.getByTestId('page-post-body').filter({ hasText: p.body.slice(0, 40) }).first()).toBeVisible({
      timeout: 20_000,
    })
  })
}

async function createOrg(page: Page, kind: BuilderKind, org: Org) {
  const j = new Journey(page, kind, org.name)
  let pageUrl = ''

  await j.step('Create', 'Create asks one question: what are you starting?', async () => {
    await page.goto('/create')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
  const created = await j.step('Choose the kind', 'Lands on the new draft Page, seen as its owner', async () => {
    await page.getByRole('radio', { name: KIND_QUESTION[kind] }).check()
    await page.getByRole('button', { name: 'Start' }).click()
    await page.waitForURL(/\/g\//, { timeout: 30_000 })
    pageUrl = page.url()
    await expect(page.getByTestId('before-you-publish')).toBeVisible()
  })
  if (!created) return j.halt()

  // #412 — Edit is section cards; each Edit opens one sheet whose Save saves
  // and closes it.
  const section = async (name: string, fill: () => Promise<void>) => {
    const edit = page.getByTestId(`edit-section-${name}`)
    if (!(await edit.isVisible())) await page.getByTestId(`edit-card-${name}`).locator('xpath=ancestor::details/summary').click()
    await edit.click()
    await fill()
    await page.getByTestId('sheet-save').click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30_000 })
  }
  await j.step('Open Edit', 'Edit: the Page in section cards', async () => {
    await page.goto(`${new URL(pageUrl).pathname}/edit`)
    await expect(page.getByTestId('edit-cards')).toBeVisible()
  })
  await j.step('Name and description', null, async () => {
    await section('name', () => page.getByTestId('edit-name').fill(org.name))
    await section('description', () => page.getByTestId('edit-description').fill(org.description))
  })
  await j.step('Tags', null, async () => {
    await section('tags', async () => {
      for (const tag of org.tags) {
        await page.getByTestId('edit-tag-input').fill(tag)
        await page.getByTestId('edit-tag-input').press('Enter')
      }
      await expect(page.getByTestId('edit-tag-list')).toContainText(org.tags[0]!)
    })
  })
  // #348's "How do people find you?". Invented organizations have no address
  // to look up, so they answer "It moves" and name the area they're usually in.
  await j.step('Where it is', null, async () => {
    await section('where', async () => {
      const where = page.getByRole('group', { name: 'How do people find you?' })
      await where.getByRole('radio', { name: /It moves/ }).check()
      await where.getByPlaceholder('Midtown farmers markets').fill(org.area)
    })
  })
  await j.step('Photo', null, async () => {
    await section('photo', async () => {
      await page.getByTestId('page-photo-input').setInputFiles(await photoFile(page, org, 'cover'))
      await expect(page.getByTestId('page-photo-preview')).toBeVisible({ timeout: 30_000 })
    })
  })
  const saved = await j.step('Links', 'Filled in: name, description, tags, area, photo and links', async () => {
    if (!org.instagram && !org.website) return
    await section('links', async () => {
      if (org.instagram) {
        await page.getByTestId('social-add').selectOption('instagram')
        await page.getByTestId('social-instagram').fill(org.instagram)
      }
      if (org.website) {
        await page.getByTestId('social-add').selectOption('website')
        await page.getByTestId('social-website').fill(org.website)
      }
    })
  })
  if (!saved) return j.halt()

  await j.step('Before you publish', 'Before you publish: everything ticked', async () => {
    await page.goto(new URL(pageUrl).pathname)
    const list = page.getByTestId('before-you-publish')
    await list.scrollIntoViewIfNeeded()
    for (const item of ['name', 'where', 'description', 'tags']) {
      const done = await page.getByTestId(`publish-item-${item}`).getAttribute('data-done')
      if (done !== 'true') j.friction('Before you publish', 'not ticked', `${item} still unticked after Edit saved`)
    }
  })
  const live = await j.step('Publish', 'Published: the live Page', async () => {
    await page.getByRole('button', { name: 'Publish' }).click()
    await expect(page.getByTestId('before-you-publish')).toHaveCount(0, { timeout: 30_000 })
  })
  if (!live) return j.halt()
  recordPage(org.name, kind, new URL(page.url()).pathname)

  await post(page, j, org.posts.find((p) => !p.when) ?? org.posts[0]!, 'Announcement')
  const event = org.posts.find((p) => p.when)
  if (event) await post(page, j, event, 'Event')
}

async function keepActive(page: Page, kind: BuilderKind, org: Org, href: string) {
  const j = new Journey(page, kind, org.name)
  recordPage(org.name, kind, href)
  await j.step('Open the Page', null, async () => {
    await page.goto(href)
  })
  await post(page, j, postFor(org, DAY), 'Daily post')
}

for (const kind of Object.keys(BUILDER_FOR) as BuilderKind[]) {
  test(`${kind} builder: create today's organizations, keep the others active`, async ({ page }) => {
    test.setTimeout(20 * 60_000)
    await signIn(page, kind)
    const own = await ownPages(page)
    for (const org of todaysNew(new Set(own.keys()), PER_KIND).filter((o) => o.kind === kind)) {
      await createOrg(page, kind, org)
    }
    for (const org of ROSTER.filter((o) => o.kind === kind && own.has(o.name))) {
      await keepActive(page, kind, org, own.get(org.name)!)
    }
  })
}

test('builders follow each other and look for a way to RSVP', async ({ page }) => {
  test.setTimeout(10 * 60_000)
  const pages = Object.entries(knownPages())
  for (const kind of Object.keys(BUILDER_FOR) as BuilderKind[]) {
    await signIn(page, kind)
    const j = new Journey(page, kind, 'Following others')
    for (const [name, p] of pages.filter(([, p]) => p.kind !== kind).slice(0, 4)) {
      await j.step(`Follow ${name}`, `Followed ${name}`, async () => {
        await page.goto(p.href)
        const follow = page.getByRole('button', { name: /^(Follow|Join)$/ })
        if (await follow.isVisible().catch(() => false)) await follow.click()
        await expect(page.getByRole('button', { name: /Following|Joined/ })).toBeVisible({ timeout: 15_000 })
      })
      const rsvp = page.getByRole('button', { name: /going|rsvp|i'?ll be there/i })
      if ((await rsvp.count()) === 0) j.friction(`RSVP on ${name}`, 'missing', 'an event post has no way to say you are going')
      else await rsvp.first().click().catch((e) => j.friction(`RSVP on ${name}`, 'stuck', String(e).slice(0, 200)))
    }
    await page.context().clearCookies()
  }
})
