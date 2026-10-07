// chore #430 — the visibility matrix: who may read what, one row per resource
// and viewer. tests/visibility.test.ts runs every cell against the local stack
// as that viewer (`anon`, or `authenticated` with the persona's id) and fails
// on any difference, so a policy that opens up, or closes, is noticed.
//
// A cell is { reach, rows }. reach is the word the PM reads: none, own (rows
// that are the viewer's), parties (rows of things the viewer belongs to) or
// all. rows is the count the seeded stack must return for that viewer.
// `pending` marks a cell whose present behaviour is asserted but whose
// intended behaviour needs a ruling (it conflicts with a ruling, or none
// covers it): it is listed in the test output, never silently accepted.
//
// Persona rows come from evals/personas.ts and supabase/seeds/personas.sql.
// The `builder` viewer is made inside the test's transaction (a builder member,
// a builder Page and a builder membership, rolled back), so the seed and the
// screenshot matrix stay as they are.
import type { PersonaKey } from '../personas'

export type Viewer = PersonaKey | 'builder'
export type Reach = 'none' | 'own' | 'parties' | 'all'
export interface Cell {
  reach: Reach
  rows: number
  pending?: string
}
export interface Resource {
  name: string
  /** A query returning one row with a `n` count. */
  sql: string
  /** Rows the resource holds in the seeded stack, seen as the superuser. */
  total: number
  /** The builder-content switch for this resource's cells (default on, as in beta). */
  switch?: 'on' | 'off'
  /** SQL run as the database owner before each viewer reads, rolled back after (e.g. archive a seeded Page). */
  setup?: string
  cells: Partial<Record<Viewer, Cell>>
  /** Cell for every viewer not listed. */
  rest: Cell
}

const NONE: Cell = { reach: 'none', rows: 0 }
const all = (rows: number): Cell => ({ reach: 'all', rows })
const own = (rows: number): Cell => ({ reach: 'own', rows })
const parties = (rows: number, pending?: string): Cell => ({ reach: 'parties', rows, ...(pending ? { pending } : {}) })

// The place Page from supabase/seeds/personas.sql, and its main spot.
const PLACE = '0b000000-0000-4000-8000-000000000002'
const PLACE_LOCATION = '0c000000-0000-4000-8000-000000000002'
const ARCHIVE_PLACE = `update public.groups set lifecycle_state = 'archived' where id = '${PLACE}'`
const DELETE_PLACE = `update public.groups set lifecycle_state = 'dissolved', dissolved_at = now(), delete_after = now() + interval '14 days' where id = '${PLACE}'`

const OWNERS = ['ownerBusiness', 'ownerPlace', 'ownerInterest', 'ownerPractice', 'ownerEvent', 'ownerFamily'] as const

export const RESOURCES: Resource[] = [
  {
    name: 'Pages listed (groups)',
    sql: "select count(*)::int n from public.groups where discoverability = 'listed' and slug like 'qa-%' and slug <> 'qa-visibility-builder'",
    total: 5,
    cells: {},
    rest: all(5),
  },
  {
    name: 'Private Page (groups)',
    sql: "select count(*)::int n from public.groups where slug = 'qa-family'",
    total: 1,
    cells: {
      member: parties(1, "the 2026-09-30 ruling says signed-out and signed-in non-participants see a private Page's front door; the database shows it to members and its steward only"),
      applicant: parties(1, 'same: see the member row'),
      ownerFamily: own(1),
    },
    rest: { reach: 'none', rows: 0, pending: "same: the 2026-09-30 ruling says a private Page's front door shows to everyone" },
  },
  {
    name: 'Posts of listed Pages (page_posts)',
    sql: "select count(*)::int n from public.page_posts p join public.groups g on g.id = p.group_id where g.discoverability = 'listed' and g.slug like 'qa-%'",
    total: 10,
    cells: { signedOut: NONE },
    rest: all(10),
  },
  {
    name: "Posts of a private Page (page_posts)",
    sql: "select count(*)::int n from public.page_posts p join public.groups g on g.id = p.group_id where g.slug = 'qa-family'",
    total: 2,
    cells: {
      ownerFamily: own(2),
      member: { reach: 'none', rows: 0, pending: 'a confirmed member of a private Page cannot read its posts (the select policy admits listed posts and the founder only); needs a ruling' },
    },
    rest: NONE,
  },
  {
    name: 'Members (members): only yourself',
    sql: 'select count(*)::int n from public.members',
    total: 13,
    cells: { signedOut: NONE },
    rest: own(1),
  },
  {
    name: 'Member privacy settings (member_privacy): only yours',
    sql: 'select count(*)::int n from public.member_privacy',
    total: 13,
    cells: { signedOut: NONE },
    rest: own(1),
  },
  {
    name: 'Page rosters (group_memberships)',
    sql: "select count(*)::int n from public.group_memberships where group_id::text like '0b000000-%'",
    total: 23,
    cells: {
      follower: parties(5),
      member: parties(18),
      applicant: parties(18),
      ownerBusiness: parties(4),
      ownerPlace: parties(4),
      ownerInterest: parties(4),
      ownerPractice: parties(4),
      ownerEvent: parties(4),
      ownerFamily: parties(3),
      builder: parties(4),
    },
    rest: NONE,
  },
  {
    name: 'RSVPs (item_responses)',
    sql: "select count(*)::int n from public.item_responses where responder_member_id::text like '0a000000-%'",
    total: 13,
    cells: {
      member: parties(12),
      rsvp: parties(13),
      ownerBusiness: parties(2),
      ownerPlace: parties(2),
      ownerInterest: parties(2),
      ownerPractice: parties(2),
      ownerEvent: parties(2),
      ownerFamily: parties(2),
    },
    rest: NONE,
  },
  {
    name: 'Reports (reports): never by table',
    sql: 'select count(*)::int n from public.reports',
    total: 1,
    cells: {},
    rest: NONE,
  },
  {
    name: 'Who edited a place (place_events): only yourself',
    sql: 'select count(*)::int n from public.place_events',
    total: 14,
    cells: {},
    rest: NONE,
  },
  {
    name: 'Who made a tag (tags.created_by): nobody, by table',
    sql: 'select count(created_by)::int n from public.tags',
    total: 2,
    cells: {},
    rest: NONE,
  },
  // #439 — an archived or deleted Page answers the people who manage it, by
  // every path: its row, its posts, its items, and the definer functions
  // that read past RLS. The operator reads it on the operator page (over the
  // pool, as Facebook and Google moderators do in their own tools), not here.
  ...(['archived', 'deleted'] as const).flatMap((state): Resource[] => {
    const setup = state === 'archived' ? ARCHIVE_PLACE : DELETE_PLACE
    return [
      { name: `A ${state} Page (groups)`, setup, sql: `select count(*)::int n from public.groups where id = '${PLACE}'`, total: 1, cells: { ownerPlace: own(1) }, rest: NONE },
      { name: `A ${state} Page's posts (page_posts)`, setup, sql: `select count(*)::int n from public.page_posts where group_id = '${PLACE}'`, total: 2, cells: { ownerPlace: own(2) }, rest: NONE },
      { name: `A ${state} Page's items (items)`, setup, sql: `select count(*)::int n from public.items where group_id = '${PLACE}'`, total: 1, cells: { ownerPlace: own(1) }, rest: NONE },
      {
        name: `A ${state} Page's items, read past RLS (venue_hosted_items)`,
        setup,
        sql: `select count(*)::int n from public.venue_hosted_items('${PLACE_LOCATION}', '${PLACE}')`,
        total: 1,
        cells: {},
        rest: NONE,
      },
      {
        name: `A ${state} Page's member count (page_listed_member_counts)`,
        setup,
        sql: `select count(*)::int n from public.page_listed_member_counts(array['${PLACE}'::uuid])`,
        total: 1,
        cells: {},
        rest: NONE,
      },
    ]
  }),
  {
    name: 'A builder Page, switch on (the beta default)',
    sql: "select count(*)::int n from public.groups where slug = 'qa-visibility-builder'",
    total: 1,
    switch: 'on',
    cells: {},
    rest: all(1),
  },
  {
    name: 'A builder Page, switch off',
    sql: "select count(*)::int n from public.groups where slug = 'qa-visibility-builder'",
    total: 1,
    switch: 'off',
    cells: { builder: own(1) },
    rest: NONE,
  },
  {
    name: "A builder's join of a real Page, switch on or off: never counts",
    sql: "select count(*)::int n from public.group_memberships where member_id = '0a000000-0000-4000-8000-000000000007'",
    total: 1,
    cells: { builder: own(1) },
    rest: NONE,
  },
]

export const VIEWERS: Viewer[] = ['signedOut', 'stranger', 'follower', 'member', 'applicant', 'rsvp', 'operator', ...OWNERS, 'builder']

/** The cell for a viewer. */
export const cellFor = (r: Resource, v: Viewer): Cell => r.cells[v] ?? r.rest

// #246 — the member-id sweep. Every column a viewer can select that holds a
// member's id (a foreign key to members or auth.users, or a name ending in
// member_id, founder or created_by) is read as each viewer, and any row naming
// someone else is a leak, unless the column is listed here with the ruling
// that lets a party see it. The sweep finds new tables by itself, so a table
// added open is red without anyone remembering to add a row.
//
// Signed out reads no one's id, ever: this list applies to signed-in viewers.
export const MEMBER_ID_READS: Record<string, string> = {
  'group_memberships.member_id': "2026-09-30: membership is scoped to the Page; its members see each other, and its owner sees its followers",
  'group_memberships.confirmed_by_member_id': 'same: who confirmed a join, seen by that Page\'s members',
  'group_events.acting_member_id': "same: a Page's members see its activity",
  'item_responses.responder_member_id': '2026-09-30: whoever is party to an RSVP sees it',
  'item_events.acting_member_id': "same: an item's organiser sees who acted on it",
  'location_events.acting_member_id': "a location's owner sees who acted on it",
  'group_category_suggestions.member_id': "a Page's founder sees who suggested a category for it",
}

/** The table a partition belongs to: member_events_y2026m10 → member_events. */
export const parentTable = (table: string) => table.replace(/_y\d{4}m\d{2}$/, '')
