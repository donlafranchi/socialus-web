import { describe, it, expect, vi, beforeEach } from 'vitest'

// F070 · T145 — a Page gets a photo at creation.
//
// Everything downstream of this already exists on main: the media bucket
// (039), `groups.photo_url`, the hide columns (T123), `visiblePhotoUrl()`,
// `HiddenPhotoNotice`, and `ShopPublicPage` rendering the result. What did not
// exist was any way to WRITE the column — `uploadImage()` had zero callers and
// no action touched `photo_url`. A Page could be hidden, restored and rendered,
// but never given a photo in the first place.
//
// So this covers the write half, at the only layer allowed to do it:
//
//   1. `photoUrl` patches `groups.photo_url` through the closed SET-clause
//      enum, like every other patchable field.
//   2. Clearing is explicit — `null` is a value, `undefined` is "don't touch".
//      The composer needs both: removing a photo is not the same as skipping
//      the step.
//   3. The draft/owner/TOCTOU refusals already guarding this handler apply to
//      the photo exactly as they do to the name. A photo is not a special case
//      with its own weaker path.

type QueryCall = [string, unknown[]?]

const { query } = vi.hoisted(() => ({ query: vi.fn() }))

vi.mock('../_lib/db', () => ({
  withTransaction: vi.fn(async (fn: (c: { query: typeof query }) => unknown) => fn({ query })),
}))

import { groupUpdateDraft, groupUpdateDraftInput } from './update-draft'
import { AuthorizationError, ValidationError } from '../_lib/errors'
import type { ActionContext } from '../_lib/context'

const GROUP = '11111111-1111-1111-1111-111111111111'
const OWNER = '22222222-2222-2222-2222-222222222222'
const OTHER = '33333333-3333-3333-3333-333333333333'
const PHOTO = 'https://x.supabase.co/storage/v1/object/public/media/m/a.webp'

function ctx(actingMemberId: string = OWNER): ActionContext {
  return {
    actingMemberId,
    viaDelegationId: null,
    traceId: 't',
    db: {} as never,
    now: () => new Date('2026-09-16T12:00:00Z'),
  }
}

/** draft business Page owned by OWNER, unless told otherwise. */
function happyPath(opts: { lifecycle?: string; owned?: boolean } = {}) {
  const { lifecycle = 'draft', owned = true } = opts
  query.mockReset()
  query.mockImplementation(async (sql: string) => {
    if (/from public\.groups/.test(sql)) {
      return { rows: [{ id: GROUP, kind: 'business', lifecycle_state: lifecycle }], rowCount: 1 }
    }
    if (/from public\.group_memberships/.test(sql)) {
      return { rows: owned ? [{ role: 'owner' }] : [], rowCount: owned ? 1 : 0 }
    }
    if (/update public\.groups/.test(sql)) return { rows: [], rowCount: 1 }
    return { rows: [], rowCount: 0 }
  })
}

const updateCall = (): QueryCall | undefined =>
  (query.mock.calls as QueryCall[]).find(([sql]) => /update public\.groups/.test(sql))

beforeEach(() => happyPath())

describe('F070 · T145 — group.update_draft accepts a photo', () => {
  it('accepts photoUrl on the input schema', () => {
    const parsed = groupUpdateDraftInput.safeParse({ groupId: GROUP, photoUrl: PHOTO })
    expect(parsed.success).toBe(true)
  })

  it('writes photo_url, and reports it as patched', async () => {
    const result = await groupUpdateDraft(ctx(), { groupId: GROUP, photoUrl: PHOTO })

    const [sql, params] = updateCall() ?? ['', []]
    expect(sql).toMatch(/photo_url = \$/)
    expect(params).toContain(PHOTO)
    expect(result.patchedFields).toContain('photo_url')
  })

  it('clears the photo when passed null — removing is not the same as skipping', async () => {
    await groupUpdateDraft(ctx(), { groupId: GROUP, photoUrl: null })

    const [sql, params] = updateCall() ?? ['', []]
    expect(sql).toMatch(/photo_url = \$/)
    expect(params).toContain(null)
  })

  it('leaves photo_url alone when photoUrl is absent', async () => {
    await groupUpdateDraft(ctx(), { groupId: GROUP, name: 'Clara' })

    const [sql] = updateCall() ?? ['', []]
    expect(sql).not.toMatch(/photo_url/)
  })

  it('rejects a photoUrl that is not a URL', () => {
    const parsed = groupUpdateDraftInput.safeParse({ groupId: GROUP, photoUrl: 'not-a-url' })
    expect(parsed.success).toBe(false)
  })

  it('refuses a photo on a Page the caller does not manage', async () => {
    happyPath({ owned: false })
    await expect(
      groupUpdateDraft(ctx(OTHER), { groupId: GROUP, photoUrl: PHOTO }),
    ).rejects.toBeInstanceOf(AuthorizationError)
  })

  it('refuses a photo on a Page that is no longer a draft', async () => {
    happyPath({ lifecycle: 'active' })
    await expect(
      groupUpdateDraft(ctx(), { groupId: GROUP, photoUrl: PHOTO }),
    ).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('F070 — group.update_draft accepts social links', () => {
  it('writes social_links as JSON, and reports it as patched', async () => {
    const result = await groupUpdateDraft(ctx(), {
      groupId: GROUP,
      socialLinks: { instagram: 'https://instagram.com/claras' },
    })

    const [sql, params] = updateCall() ?? ['', []]
    expect(sql).toMatch(/social_links = \$/)
    expect(params).toContain(JSON.stringify({ instagram: 'https://instagram.com/claras' }))
    expect(result.patchedFields).toContain('social_links')
  })

  // The column is read straight into an href on a public Page. A handler that
  // accepted this would be the XSS.
  it('refuses a link that is not an https URL, and names it', async () => {
    await expect(
      groupUpdateDraft(ctx(), { groupId: GROUP, socialLinks: { instagram: 'javascript:alert(1)' } }),
    ).rejects.toThrow(/instagram/)
  })

  it('drops an unknown platform rather than storing it', async () => {
    await groupUpdateDraft(ctx(), {
      groupId: GROUP,
      socialLinks: { myspace: 'https://myspace.com/x', website: 'https://claras.example' },
    })
    const [, params] = updateCall() ?? ['', []]
    expect(params).toContain(JSON.stringify({ website: 'https://claras.example' }))
  })

  it('an empty value clears that link — removing is a deliberate act', async () => {
    await groupUpdateDraft(ctx(), { groupId: GROUP, socialLinks: { instagram: '' } })
    const [, params] = updateCall() ?? ['', []]
    expect(params).toContain('{}')
  })

  it('leaves social_links alone when the field is absent', async () => {
    await groupUpdateDraft(ctx(), { groupId: GROUP, name: 'Clara' })
    const [sql] = updateCall() ?? ['', []]
    expect(sql).not.toMatch(/social_links/)
  })
})

// #301 — a draft is finished on its own Page, and tags are set there and still
// required to publish (2026-10-01). Edit sends them; the draft keeps them.
describe('#301 — group.update_draft saves the tags', () => {
  const calls = (re: RegExp) => (query.mock.calls as QueryCall[]).filter(([sql]) => re.test(sql))

  it('replaces the draft\'s tags with the set sent, one per word however it was typed', async () => {
    const out = await groupUpdateDraft(ctx(), { groupId: GROUP, tags: ['Sourdough', ' SOURDOUGH ', 'rye'] })
    expect(out.patchedFields).toContain('tags')
    expect(calls(/insert into public\.tags/).map(([, p]) => p![1])).toEqual(['sourdough', 'rye'])
    const [drop] = calls(/delete from public\.page_tags/)
    expect(drop![1]).toEqual([GROUP, ['sourdough', 'rye']])
    expect(calls(/insert into public\.page_tags/)).toHaveLength(2)
  })

  it('tags alone touch no column on the Page', async () => {
    await groupUpdateDraft(ctx(), { groupId: GROUP, tags: ['bread'] })
    expect(updateCall()).toBeUndefined()
  })

  it('a stranger cannot set them', async () => {
    happyPath({ owned: false })
    await expect(groupUpdateDraft(ctx(OTHER), { groupId: GROUP, tags: ['x'] })).rejects.toThrow()
    expect(calls(/page_tags/)).toHaveLength(0)
  })

  it('not sent, they are left alone', async () => {
    await groupUpdateDraft(ctx(), { groupId: GROUP, name: 'Oak Park Sourdough' })
    expect(calls(/page_tags/)).toHaveLength(0)
  })
})

describe('#348 — where it is, on a draft', () => {
  it('writes the answer with the rest of the draft', async () => {
    const out = await groupUpdateDraft(ctx(), { groupId: GROUP, whereMode: 'roaming', usuallyAround: 'Midtown farmers markets' })
    expect(out.patchedFields).toEqual(expect.arrayContaining(['where_mode', 'usually_around']))
    expect(updateCall()![0]).toMatch(/usually_around = \$2/)
  })
})

describe('hours and phone on a draft', () => {
  it('records the switch', async () => {
    const out = await groupUpdateDraft(ctx(), { groupId: GROUP, contactComponent: false })
    expect(out.patchedFields).toContain('components')
    const call = (query.mock.calls as unknown as [string, unknown[]][]).find(([s]) => /jsonb_build_object\('contact'/.test(s))
    expect(call![1]).toEqual([GROUP, false])
  })
})

describe('#450 — an email address in draft Page text is refused on save', () => {
  it.each(['name', 'description', 'businessDisplayName', 'businessPublicDescription', 'howToFind', 'usuallyAround'] as const)(
    'refuses one in %s, before any write',
    async (field) => {
      const err = await groupUpdateDraft(ctx(), { groupId: GROUP, [field]: 'Reach Owner@Example.com' }).catch((e) => e)
      expect(err).toBeInstanceOf(ValidationError)
      expect(err.message).toBe('Take out the email address. People can reach you through your Page.')
      expect(updateCall()).toBeUndefined()
    },
  )
})

// F099 criterion 1 — a draft Page may set its Page picture, apart from its photo.
describe('F099 — group.update_draft accepts a Page picture', () => {
  const PICTURE = `https://x.supabase.co/storage/v1/object/public/media/${OWNER}/55555555-5555-4555-8555-555555555555.webp`

  // [guards F099.1]
  it('writes picture_url and not photo_url', async () => {
    const result = await groupUpdateDraft(ctx(), { groupId: GROUP, pictureUrl: PICTURE })
    const [sql, params] = updateCall() ?? ['', []]
    expect(sql).toMatch(/picture_url = \$/)
    expect(sql).not.toMatch(/\bphoto_url\b/)
    expect(params).toContain(PICTURE)
    expect(result.patchedFields).toEqual(['picture_url'])
  })

  // [guards F099.5]
  it("refuses a picture outside the uploader's own folder", async () => {
    await expect(groupUpdateDraft(ctx(), { groupId: GROUP, pictureUrl: PHOTO })).rejects.toThrow(/uploads/)
    expect(updateCall()).toBeUndefined()
  })
})
