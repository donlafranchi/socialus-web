// F081 criteria 3, 4, 6, 8 and F103 criterion 3, end to end: the signup screen → completeOnboardingAction →
// member.signup_profile.set → the database, and the zip change on You → changeZipAction → member.zip.set. Only the
// Supabase client (pg stand-in, tests/support/pg-supabase.ts) and the hour-cached waitlist count are replaced.

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'the zip a person types decides their market, on screen and in the database, at signup and on every change',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const h = vi.hoisted(() => ({ client: null as unknown, user: null as { id: string } | null }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/supabase-server', async () => {
  const { pgSupabase: make } = await import('./support/pg-supabase')
  return { createClient: async () => make(h.client as PoolClient, () => h.user) }
})
// The count is an hour-cached Next read (unstable_cache); it has no bearing on where anyone waits.
vi.mock('@/lib/metro/waitlist-counts', () => ({ waitingCountFor: async () => null }))

import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow'
import { ZipChange } from '@/components/member/ZipChange'
import { changeZipAction } from '@/app/_actions/zip-actions'
import { joinMetroWaitlistAction } from '@/app/_actions/metro-waitlist-actions'

const ROOT = resolve(__dirname, '..')
const OPEN = 'a1000000-0000-4000-8000-000000000853'
const WAIT = 'b1000000-0000-4000-8000-000000000853'
const MOVER = 'c1000000-0000-4000-8000-000000000854'
const UNKNOWN = 'd1000000-0000-4000-8000-000000000853'
const WAIT2 = 'e1000000-0000-4000-8000-000000000853'
const PLAIN = 'f1000000-0000-4000-8000-000000000856'
const PEOPLE = [OPEN, WAIT, MOVER, UNKNOWN, WAIT2, PLAIN]

let pool: Pool
let client: PoolClient
let countyMetroExisted = false

const member = async (id: string) =>
  (await client.query(`select * from public.members where id = $1`, [id])).rows[0] as Record<string, unknown>
const zipKeyOf = async (zip: string) => (await client.query(`select public.zip_market_key($1) as k`, [zip])).rows[0].k as string | null
const metroOf = async (key: string) => (await client.query(`select public.market_metro($1) as id`, [key])).rows[0].id as string

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await client.query(`delete from public.metro_waitlist where member_id = any($1)`, [PEOPLE])
  await client.query(`delete from public.member_events where acting_member_id = any($1)`, [PEOPLE])
  await client.query(`delete from public.members where id = any($1)`, [PEOPLE]) // a run that died before its afterAll
  await client.query(`delete from auth.users where id = any($1)`, [PEOPLE])
  h.client = client
  countyMetroExisted = (await client.query(`select 1 from public.metro_polygons where slug = 'county-06101'`)).rowCount === 1
  for (const id of PEOPLE) {
    const handle = `s853-${id.slice(0, 2)}`
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${handle}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, handle])
  }
})

afterEach(() => cleanup())

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.metro_waitlist where member_id = any($1)`, [PEOPLE])
  await client.query(`delete from public.member_events where acting_member_id = any($1)`, [PEOPLE])
  await client.query(`delete from public.members where id = any($1)`, [PEOPLE])
  await client.query(`delete from auth.users where id = any($1)`, [PEOPLE])
  if (!countyMetroExisted) {
    await client.query(
      `delete from public.metro_polygons p where p.slug = 'county-06101' and not exists (select 1 from public.metro_waitlist w where w.metro_id = p.id)`,
    )
  }
  client.release()
  await pool.end()
})

function signUpScreen(as: string) {
  h.user = { id: as }
  return render(<OnboardingFlow onNavigate={vi.fn()} onJoinWaitlist={joinMetroWaitlistAction} />)
}

function submit(zip: string) {
  fireEvent.change(screen.getByTestId('onboarding-legal-name'), { target: { value: 'Maya Rivera' } })
  fireEvent.change(screen.getByTestId('onboarding-name'), { target: { value: 'Maya' } })
  fireEvent.change(screen.getByTestId('onboarding-zip'), { target: { value: zip } })
  fireEvent.click(screen.getByTestId('onboarding-adult'))
  fireEvent.click(screen.getByTestId('onboarding-continue'))
}

/** No way to choose a place: no select, combobox, listbox or radio, and no search box. */
function expectNothingToPick(root: HTMLElement) {
  for (const role of ['combobox', 'listbox', 'option', 'radio', 'searchbox']) expect(within(root).queryAllByRole(role)).toHaveLength(0)
  expect(root.querySelectorAll('select, datalist, input[type=radio]')).toHaveLength(0)
}

// Every file the signup path runs through: the screens, the actions, the lookup, the handler.
const SIGNUP_PATH = [
  'src/components/auth/EmailFirstSignup.tsx',
  'src/components/onboarding/OnboardingFlow.tsx',
  'src/components/onboarding/PhoneVerifyStep.tsx',
  'src/app/onboarding/page.tsx',
  'src/app/onboarding/actions.ts',
  'src/app/onboarding/phone-actions.ts',
  'src/lib/signup/profile.ts',
  'src/lib/signup/zip-market.ts',
  'src/actions/member/signup-profile-set.ts',
  'src/app/_actions/zip-actions.ts',
  'src/actions/member/zip-set.ts',
]
// IP, GPS or a default standing in for the zip.
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const NOT_THE_ZIP = /geolocation|getCurrentPosition|x-forwarded-for|x-real-ip|x-vercel-ip|request\.geo\b|\bgeo\s*[:=(]|ipinfo|ipapi|geoip|DEFAULT_(HOME|METRO|MARKET|PLACE)|default_metro_id|nearest/i

describe.skipIf(!RUNNABLE)('F081.3 / F103.3 — the zip decides, nobody picks', () => {
  // [guards F081.3] [guards F103.3]
  it('an open zip signs the person in and names the market; a waiting zip names the market and waits there; nothing else decides', async () => {
    const sacMetro = await metroOf('sacramento')

    const open = signUpScreen(OPEN)
    expect(screen.getByTestId('onboarding-zip')).toHaveValue('') // no pre-filled default
    expectNothingToPick(open.container)
    submit('95746')
    expect(await screen.findByTestId('onboarding-metro', {}, { timeout: 10_000 })).toHaveTextContent('You’re in Sacramento')
    expectNothingToPick(open.container)
    expect(await member(OPEN)).toMatchObject({ zip: '95746', home_market_key: 'sacramento', home_metro_id: sacMetro })
    cleanup()

    const waiting = signUpScreen(WAIT)
    submit('95991')
    expect(await screen.findByTestId('waitlist-market', {}, { timeout: 10_000 })).toHaveTextContent('Sutter County, CA')
    expect(screen.queryByTestId('onboarding-metro')).toBeNull()
    expect(waiting.container.querySelectorAll('select, datalist')).toHaveLength(0)
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(await member(WAIT)).toMatchObject({ zip: '95991', home_market_key: 'county-06101', home_metro_id: null, home_town: null })
    // The radios here are F076's make-or-find question on the waitlist entry, not a place.
    fireEvent.click(screen.getByRole('radio', { name: /find/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    const sutter = await metroOf('county-06101')
    await waitFor(async () => {
      expect((await client.query(`select metro_id from public.metro_waitlist where member_id = $1`, [WAIT])).rows).toEqual([{ metro_id: sutter }])
    }, { timeout: 10_000 })

    // Nothing on the signup path reads an IP, a position or a default in place of the zip.
    const offenders = SIGNUP_PATH.filter((f) => NOT_THE_ZIP.test(code(readFileSync(resolve(ROOT, f), 'utf8'))))
    expect(offenders).toEqual([])
  }, 60_000)

  it('the scan sees a position or an IP standing in for the zip', () => {
    expect(NOT_THE_ZIP.test('navigator.geolocation.getCurrentPosition(cb)')).toBe(true)
    expect(NOT_THE_ZIP.test("headers().get('x-forwarded-for')")).toBe(true)
    expect(NOT_THE_ZIP.test('metroId: DEFAULT_METRO_ID')).toBe(true)
    expect(NOT_THE_ZIP.test(code('// not a nearest match'))).toBe(false)
  })
})

describe.skipIf(!RUNNABLE)('F081.8 — every US zip resolves; an unknown one is refused; a waiting one joins its waitlist', () => {
  // [guards F081.8 partial: the zip → county source is the Census ZCTA file ranked by land area, not the HUD-USPS crosswalk (#849)]
  it('every zip in the national table has a market, an unknown zip is refused in the exact words, and a waiting zip is kept', async () => {
    const t = (
      await client.query(
        `select count(*)::int as zips, count(*) filter (where public.market_key(county_fips, cousub_geoid) is null)::int as unresolved,
                count(distinct left(county_fips, 2))::int as states
           from public.zip_county`,
      )
    ).rows[0]
    expect(t.zips).toBeGreaterThan(33_000)
    expect(t.states).toBeGreaterThanOrEqual(51) // the 50 states and DC
    expect(t.unresolved).toBe(0) // zip_market_key is market_key over this row; called per zip it takes a minute
    for (const zip of ['95746', '96150', '95991', '10001', '99501', '96813']) expect(await zipKeyOf(zip)).toMatch(/^(sacramento|tahoe|county-\d{5})$/)

    signUpScreen(UNKNOWN)
    submit('00000')
    expect(await screen.findByText("We don't recognize that zip, try again.", {}, { timeout: 10_000 })).toBeInTheDocument()
    expect(screen.getByTestId('onboarding-form')).toBeInTheDocument()
    expect(await member(UNKNOWN)).toMatchObject({ zip: null, home_market_key: null, adult_confirmed_at: null })
    cleanup()

    // A waiting zip: on the waitlist of the market it named, the zip kept.
    signUpScreen(WAIT2)
    submit('95991')
    await screen.findByTestId('waitlist-market', {}, { timeout: 10_000 })
    fireEvent.click(screen.getByRole('radio', { name: /find/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    const sutter = await metroOf('county-06101')
    await waitFor(async () => {
      expect((await client.query(`select metro_id from public.metro_waitlist where member_id = $1`, [WAIT2])).rows).toEqual([{ metro_id: sutter }])
    }, { timeout: 10_000 })
    expect((await member(WAIT2)).zip).toBe('95991')
  }, 60_000)
})

describe.skipIf(!RUNNABLE)('F081.4 — nobody picks a market at signup; the zip changes on You and the market follows', () => {
  async function changeTo(zip: string, says: string) {
    fireEvent.click(screen.getByRole('button', { name: /change zip/i }))
    fireEvent.change(screen.getByLabelText(/zip/i), { target: { value: zip } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(screen.getByTestId('zip-result')).toHaveTextContent(says), { timeout: 10_000 })
    expect(screen.getByTestId('zip-current')).toHaveTextContent(zip)
  }

  // [guards F081.4]
  it('signs up in one market with nothing to pick, then moves three times and the market and home town follow each time', async () => {
    const signup = signUpScreen(MOVER)
    expectNothingToPick(signup.container)
    submit('95746')
    await screen.findByTestId('onboarding-metro', {}, { timeout: 10_000 })
    expectNothingToPick(signup.container)
    expect(await member(MOVER)).toMatchObject({ zip: '95746', home_market_key: 'sacramento', home_town: 'Granite Bay' })
    cleanup()

    render(<ZipChange zip="95746" area="Sacramento" change={changeZipAction} />)
    await changeTo('95991', 'SocialUs isn’t in Sutter County, CA yet')
    expect(await member(MOVER)).toMatchObject({ zip: '95991', home_market_key: 'county-06101', home_town: null, home_metro_id: null })
    await changeTo('95819', 'You’re in Sacramento')
    expect(await member(MOVER)).toMatchObject({ zip: '95819', home_market_key: 'sacramento', home_town: 'Sacramento', home_metro_id: await metroOf('sacramento') })
    await changeTo('95616', 'You’re in Sacramento')
    expect(await member(MOVER)).toMatchObject({ zip: '95616', home_market_key: 'sacramento', home_town: 'Davis' })
  }, 60_000)
})

// Words that ask or answer whether someone makes or finds (F076's waitlist question lives after signup, on the entry).
const MAKE_OR_FIND = /\b(make|makes|making|find|finds|finding|sell|sells|buy|buys)\s+(things|stuff|items)\b|\bmake or find\b|\bfind or make\b|\b(maker|makers|finder|finders|creator|creators|patron|patrons)\b|\bhere to (make|find|sell|buy|shop)\b|\bI\s+(make|find|sell|buy)\b/i

describe.skipIf(!RUNNABLE)('F081.6 — signup neither asks nor records whether the person makes or finds', () => {
  // [guards F081.6]
  it('no field, control or string on the signup screens asks it, the handler takes no such input, and a signup writes no such column', async () => {
    const { memberSignupProfileSetInput } = await import('@/actions/member/signup-profile-set')
    expect(Object.keys(memberSignupProfileSetInput.shape).sort()).toEqual(['adultConfirmed', 'displayName', 'legalName', 'metroId', 'zip'])

    const before = await member(PLAIN)
    const view = signUpScreen(PLAIN)
    const asks = (root: HTMLElement) => {
      const controls = [...root.querySelectorAll('input, select, textarea, button, label, [role]')].map(
        (el) => `${el.getAttribute('name') ?? ''} ${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('data-testid') ?? ''}`,
      )
      return [root.textContent ?? '', ...controls].filter((s) => MAKE_OR_FIND.test(s))
    }
    expect(asks(view.container)).toEqual([])
    expect(view.container.querySelectorAll('input')).toHaveLength(4)
    submit('95819')
    await screen.findByTestId('onboarding-metro', {}, { timeout: 10_000 })
    expect((view.container.textContent ?? '').match(MAKE_OR_FIND)).toBeNull()

    const after = await member(PLAIN)
    const changed = Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]))
    const SIGNUP_COLUMNS = ['legal_name', 'display_name', 'zip', 'adult_confirmed_at', 'home_metro_id', 'home_market_key', 'home_town', 'home_town_geoid', 'updated_at']
    expect(changed.filter((k) => !SIGNUP_COLUMNS.includes(k))).toEqual([])
    expect(changed).toContain('zip')
  }, 60_000)

  it('the pattern sees a make-or-find question', () => {
    expect(MAKE_OR_FIND.test('I make things')).toBe(true)
    expect(MAKE_OR_FIND.test("I'm here to find things")).toBe(true)
    expect(MAKE_OR_FIND.test('Your zip helps us find your area.')).toBe(false)
  })
})
