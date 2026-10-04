// THE LINK TYPES — the relationships, named.
//
// Why this file exists, and why it is code rather than a document:
//
// The nouns have a home (`ops-pattern product/foundation/nouns.md`) and so do
// the verbs (`verbs.md`). The relationships between them never had one. They
// lived implicitly in foreign keys, which meant every question about them was
// answered by reading migrations — and the same relationships kept being
// rediscovered. The clearest case: *a Member supporting a Page* and *a Member
// subscribed to a Page's updates* are two different links between the same two
// nouns, and there was nowhere to write that down.
//
// It is code because ops-pattern's own `process/LIVING-DOCS.md` already ruled
// on this: **"a file only a script compares is safe, because nothing believes
// it."** A document named REGISTRY died here once, along with MAP, TRACE,
// STAGE-LEDGER and JOURNAL, for exactly the reason that people read them to be
// right and they went stale. This is imported by a conformance check that runs
// at `npm test`, so a wrong entry is a build failure rather than a lie.
//
// WHAT THIS IS NOT: a description of the database. It declares MEANING — what
// a link IS, between which nouns, and which ruling put it there. `via` names
// the table and column only so the check has something real to verify against;
// it is a pointer, not a schema. If you find yourself adding a column type or
// an index here, it has drifted into being a second copy of the migrations.
//
// SCOPE: every relationship the app runs on today, and nothing else. It began
// at six; the other six were found by the survey that followed T156, which had
// leaned on four of them. The test for admission is not "is there a foreign
// key" — it is whether the link carries a ruling you could not recover by
// reading the column. A Page with no anchor Location is in no browse result at
// all; a post never borrows its Page's pin; a hidden tag must stop steering a
// lens. Strip those notes and what is left is the migrations again.
//
// Not declared, on purpose: the events tables, unused substrate (delegations,
// messages), retired vendor surfaces, PostGIS internals, and anything keyed to
// `groups.kind` — the Page kinds question is unruled and declaring links over a
// vocabulary that is actively changing buys a rename.
//
// Not declared, but only for now: a Page's collection membership, ruled
// 2026-09-19. It has no table yet, and Rule 5b fails a link pointing at a table
// no migration creates. It arrives with its migration.
//
// OBJECT TYPES are deferred. A noun gets a declaration the next time a handler
// touching it is edited; there is no 24-handler rewrite here.
//
// KEEPING IT CURRENT: when a ruling introduces or changes a link, the same
// change updates this file. See CLAUDE.md § The ontology.

import type { ObjectTypeName } from './objects'

export type { ObjectTypeName }
export { OBJECT_TYPE_NAMES, OBJECT_TYPES } from './objects'

export interface LinkType {
  /** What the relationship IS, in the project's own words. */
  name: string
  from: ObjectTypeName
  to: ObjectTypeName
  /** The table and column that carry it. A pointer for the check, not a schema. */
  via: { table: string; column: string }
  /**
   * Handler names that write this link, as registered in `src/actions/index.ts`.
   * Verified against `listHandlers()` — never hand-maintained in two places.
   * Empty means nothing writes it yet, which is a fact worth failing on later
   * but not today.
   */
  writtenBy: readonly string[]
  /**
   * The DECISIONS.md date that ruled it. `null` where there is no dated line —
   * it predates the log, or the rule lives in a foundation doc instead, and
   * then `note` says which. Never a nearby date standing in for an exact one.
   */
  ruled: string | null
  /** Is it real today? An unbuilt link is declared and marked, never implied. */
  built: boolean
  /** Anything a reader would otherwise have to reconstruct from migrations. */
  note?: string
}

export const LINK_TYPES: readonly LinkType[] = [
  {
    name: 'a Member owns a Page',
    from: 'Member',
    to: 'Page',
    via: { table: 'groups', column: 'founder_member_id' },
    writtenBy: ['group.create'],
    ruled: null,
    built: true,
    note: 'Ownership, not membership. The founder column is also what a member\'s own-Pages list reads.',
  },
  {
    name: 'a Member authored an Item',
    from: 'Member',
    to: 'Item',
    via: { table: 'items', column: 'member_id' },
    writtenBy: ['item.create'],
    ruled: null,
    built: true,
    note: 'Authorship survives the Item moving between Pages; `group_id` is nullable, this is not.',
  },
  {
    name: 'an Item is filed under a Page',
    from: 'Item',
    to: 'Page',
    via: { table: 'items', column: 'group_id' },
    writtenBy: ['item.create'],
    ruled: null,
    built: true,
    note:
      'Optional, and deliberately so: an Item exists before it has a Page to sit under, and the ' +
      'responsible human is never in doubt because items.member_id is NOT NULL while this is not. ' +
      'Filing is a placement; authorship is the accountability, and they are different links.',
  },
  {
    name: 'an Item is at a Location',
    from: 'Item',
    to: 'Location',
    via: { table: 'item_locations', column: 'location_id' },
    writtenBy: ['item.attach_location'],
    ruled: null,
    built: true,
    note:
      'An Item may be at more than one Location at once — the same thing offered at two markets ' +
      'is one Item with two placements, not two Items. That is why this is a join table and why ' +
      "an Item's locality is a set rather than a field, which every place-scoped read has to " +
      'handle rather than assuming one address.',
  },
  {
    name: "a Member is subscribed to a Page's updates",
    from: 'Member',
    to: 'Page',
    via: { table: 'group_memberships', column: 'relationship' },
    writtenBy: ['group.follow', 'group.unfollow'],
    ruled: '2026-09-17',
    built: true,
    note:
      'This IS the existing follow — "get updates" names what it is for rather than adding a ' +
      'second mechanism. Its stated purpose is to replace promotional email: updates arrive in ' +
      'the app and a Page owner never holds a contact address. The row carries ' +
      "source = 'soft_via_follow', which is what keeps an open Page's follower list unreadable. " +
      'Unbuilt alongside it: nothing yet READS these rows to show a subscriber their updates.',
  },
  {
    name: 'a Member supports a Page',
    from: 'Member',
    to: 'Page',
    via: { table: 'group_memberships', column: 'relationship' },
    writtenBy: [],
    ruled: '2026-09-17',
    built: false,
    note:
      'The ribbon. A soft signal with NO inbox consequence — no notification, no digest, no ' +
      'subscription. If it ever produces an alert it has silently become the link above. ' +
      'UNBUILT: no column, no handler, no control. Note the constraint it runs into — ' +
      'group_memberships is keyed (group_id, member_id), one row per pair, so support and ' +
      'subscription cannot both be a value of one `relationship` column. Extending the row ' +
      'rather than adding a table is the preferred shape; it is not decided.',
  },
  {
    name: 'an Announcement is posted to a Page',
    from: 'Announcement',
    to: 'Page',
    via: { table: 'page_posts', column: 'group_id' },
    writtenBy: ['group.post_create'],
    ruled: '2026-09-10',
    built: true,
    note:
      'The Page is the board; an announcement is the first kind of post. One table and one ' +
      'composer carry both the undated post and the dated one — that ruling is why there is no ' +
      '`bulletins` table and no separate event entity. NOT NULL, and load-bearing because of it: ' +
      'a post has no existence apart from its Page, which is what lets T156 return Pages and ' +
      'posts in one result set without inventing a second identity for the poster.',
  },
  {
    name: 'an Announcement is at a Location',
    from: 'Announcement',
    to: 'Location',
    via: { table: 'page_posts', column: 'location_id' },
    writtenBy: [],
    ruled: null,
    built: false,
    note:
      "A post carries its OWN address or none. It never borrows its Page's pin — the rule is in " +
      'product/foundation/model.md rather than a dated DECISIONS line, and T156 implements it by ' +
      "projecting the post's own geography and null where it has none. DECLARED UNBUILT ON " +
      'PURPOSE, because the honest state is odd and invisible: the column exists, browse reads it, ' +
      'and nothing writes it. group.post_create inserts a post without a location and there is no ' +
      'composer field for one. So every post in production is addressless, and a read path built ' +
      "to tell a post's pin from its Page's has nothing yet to tell apart.",
  },
  {
    name: 'a Page is anchored at a Location',
    from: 'Page',
    to: 'Location',
    via: { table: 'groups', column: 'anchor_location_id' },
    writtenBy: ['group.create', 'group.update_draft', 'group.update'],
    ruled: null,
    built: true,
    note:
      'The anchor is what gives a Page a locality, and locality is the whole basis of Browse: ' +
      'T156 joins it INNER, so a Page without one appears in no metro and no Place result at all ' +
      '— not ranked low, absent. group.activate refuses to publish a Page that has no anchor, ' +
      'which is the same rule enforced one step earlier where a person can still fix it. This is ' +
      "the Page's own address; the Place it sits in is one join further on, and is a separate link.",
  },
  {
    name: 'a Member follows a Member',
    from: 'Member',
    to: 'Member',
    via: { table: 'member_follows', column: 'followed_member_id' },
    writtenBy: ['member.follow', 'member.unfollow'],
    ruled: '2026-09-30',
    built: true,
    note:
      'Person to person, and the only link of that shape — nouns.md is explicit that ' +
      'a Person follows a Person and nothing else, and that messages do not exist. A PAGE CANNOT ' +
      'BE FOLLOWED ' +
      'THROUGH THIS TABLE: that is group_memberships and a different link entirely, which is why ' +
      'group.follow does not touch it. Unfollowing sets unfollowed_at rather than deleting the ' +
      'row, so the link is reversible without losing that it once existed. Nobody sees who ' +
      'follows whom: the row is readable by the follower alone (2026-09-30).',
  },
  {
    name: 'a Page carries a Tag',
    from: 'Page',
    to: 'Tag',
    via: { table: 'page_tags', column: 'tag_id' },
    writtenBy: ['group.activate', 'group.update'],
    ruled: '2026-10-01',
    built: true,
    note:
      'Tags are the only vocabulary a CREATOR authors, and the only thing search matches. That ' +
      'ruling was narrowed on 2026-09-19 and not reversed: collections are platform vocabulary an ' +
      'owner picks from, which is a different link with no table yet. Written at activation and ' +
      'editable any time after (2026-10-01), never down to none. T156 matches a lens on tags.normalized and ' +
      'excludes hidden ones, so a tag taken down stops steering discovery rather than merely ' +
      'disappearing from display.',
  },
  {
    name: 'a Location is in a Place',
    from: 'Location',
    to: 'Place',
    via: { table: 'locations', column: 'place_id' },
    writtenBy: [],
    ruled: null,
    built: true,
    note:
      "The join two SQL functions walk: place_url_path() for a Page's URL, and " +
      'zip_is_proximal_to_location() for the local-owner badge (T075). NOTHING IN THE ACTION ' +
      'LAYER WRITES IT, and that is the fact worth declaring rather than a gap to close here — ' +
      'Places are platform-curated with no member-facing create surface, so the column is ' +
      'populated by seed data. The one member-facing location insert omits it, which means those ' +
      'Locations have a null place_path in browse until a backfill gives them one.',
  },
  {
    name: 'a Member runs a Page',
    from: 'Member',
    to: 'Page',
    via: { table: 'group_memberships', column: 'role' },
    writtenBy: ['group.create'],
    ruled: '2026-09-19',
    built: true,
    note:
      'AUTHORITY, not attachment — the only relation that implies being able to change a Page, ' +
      'and the one every managing check actually reads (requireManagingRole, role in owner or ' +
      'steward, branching by Page kind). DISTINCT FROM "a Member owns a Page", which points at ' +
      'groups.founder_member_id: that column records who STARTED the Page and is not what any ' +
      'permission consults. Today they coincide because group.create writes both; nothing makes ' +
      'them stay that way, and a steward who did not found a Page has authority under this link ' +
      'and appears under neither of the others. Declared because leaving it implicit is how a ' +
      'relation becomes an identity — the role is on the link, never on the person.',
  },
] as const

/** Declared links whose backing is real today. */
export function builtLinks(): readonly LinkType[] {
  return LINK_TYPES.filter((l) => l.built)
}

/** Every handler name any link claims to be written by. */
export function declaredWriters(): string[] {
  return [...new Set(LINK_TYPES.flatMap((l) => l.writtenBy))].sort()
}
