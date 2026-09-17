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
// SCOPE, deliberately small. Six links that are already load-bearing. Not
// declared, on purpose: the events tables, unused substrate (delegations,
// messages), retired vendor surfaces, PostGIS internals, and anything keyed to
// `groups.kind` — the Page kinds question is unruled and declaring links over a
// vocabulary that is actively changing buys a rename.
//
// OBJECT TYPES are deferred. A noun gets a declaration the next time a handler
// touching it is edited; there is no 24-handler rewrite here.
//
// KEEPING IT CURRENT: when a ruling introduces or changes a link, the same
// change updates this file. See CLAUDE.md § The ontology.

/** A noun. Named, not defined — the definitions live in `nouns.md`. */
export type ObjectTypeName =
  | 'Member'
  | 'Page'
  | 'Item'
  | 'Location'
  | 'Place'
  | 'Post'

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
  /** The DECISIONS.md date that ruled it. `null` where it predates the log. */
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
    note: 'Nullable: an Item can exist before it has a Page to sit under.',
  },
  {
    name: 'an Item is at a Location',
    from: 'Item',
    to: 'Location',
    via: { table: 'item_locations', column: 'location_id' },
    writtenBy: ['item.attach_location'],
    ruled: null,
    built: true,
    note: 'A join table, not a column: an Item may be at more than one Location.',
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
] as const

/** Declared links whose backing is real today. */
export function builtLinks(): readonly LinkType[] {
  return LINK_TYPES.filter((l) => l.built)
}

/** Every handler name any link claims to be written by. */
export function declaredWriters(): string[] {
  return [...new Set(LINK_TYPES.flatMap((l) => l.writtenBy))].sort()
}
