// THE OBJECT TYPES — the nouns, named and located. Pointers, not definitions.
//
// Deferred since 2026-09-17 on the reasoning that a noun should get a
// declaration the next time a handler touching it was edited. That rule had two
// chances and fired zero times, because there was no shape a declaration could
// take — `ObjectTypeName` was a string union and nothing else. Ruled 2026-09-19:
// build them pointer-style rather than leave a promise nothing can keep.
//
// WHAT A DECLARATION IS: a name, a status in `nouns.md`'s own vocabulary, and
// where the definition lives. That is the whole of it.
//
// WHAT IT IS NOT, and the line that must not be crossed: fields, columns, types,
// indexes, constraints, table names. `links.ts` may name a table because a check
// compares against it; an object type may not, because there is nothing here for
// a table to be checked against. A noun listing its columns is the migrations
// written twice, and the second copy is the one that goes wrong quietly.
//
// WHY THIS IS NOT JUST A DOCUMENT: `status` is checked, not asserted. A noun
// declared `live` must be related by at least one link that is actually built —
// see tests/ci-enforcement-rule-5.test.ts. That is what makes a wrong status a
// red build rather than a sentence nobody rereads.
//
// ROLES ARE NOT NOUNS. Don, 2026-09-19: "Person" is rejected as a noun — it is
// generic and means nothing in this app — and the words that replace it in
// conversation (creator, organizer, follower, member, patron) are NOT object
// types either. They are one person in different relations to a Page, and the
// nuance lives on the relationship. Adding any of them here would turn a
// relation into an identity, which `nouns.md` refuses in the Member row: "no
// type, tier, or stored role." A test enforces it.

/** Every noun the links relate. Names only — the definitions live in `nouns.md`. */
export const OBJECT_TYPE_NAMES = [
  'Member',
  'Page',
  'Item',
  'Location',
  'Place',
  'Announcement',
  'Tag',
] as const

export type ObjectTypeName = (typeof OBJECT_TYPE_NAMES)[number]

/**
 * `nouns.md`'s own status vocabulary, reused rather than reinvented so the two
 * can be compared by eye and by script:
 *   live      ● schema plus a working surface
 *   substrate ◐ the table exists and nothing reads or writes it
 *   postponed ○ ruled in, not scheduled
 *   refused   ✕ deliberately absent, and the reason is the entry
 */
export type ObjectTypeStatus = 'live' | 'substrate' | 'postponed' | 'refused'

export interface ObjectType {
  name: ObjectTypeName
  status: ObjectTypeStatus
  /** Where the noun is DEFINED. A pointer into `nouns.md`, never a definition. */
  definedIn: string
  /** Only what a reader of `nouns.md` would otherwise get wrong. */
  note?: string
}

export const OBJECT_TYPES: readonly ObjectType[] = [
  {
    name: 'Member',
    status: 'live',
    definedIn: 'nouns.md § The nouns that ship',
    note:
      'One real human, one account. The spine calls the concept Person and names Member as its ' +
      'schema name; "Person" itself is rejected as a noun (2026-09-19) for being generic. What a ' +
      'member IS carries no type, tier or stored role — creator, organizer, follower and patron ' +
      'are relations to a Page, declared as links, never as a kind of person.',
  },
  {
    name: 'Page',
    status: 'live',
    definedIn: 'nouns.md § Page — the canonical definition',
    note:
      'The person or people behind the listing. Every kind gets one, including a one-time ' +
      'gathering; what differs between kinds is the tools offered, never whether it is a Page. ' +
      'How many kinds there are is unruled, which is why no link is keyed to groups.kind.',
  },
  {
    name: 'Item',
    status: 'live',
    definedIn: 'nouns.md § The nouns that ship',
    note:
      'Anything a person declares, varying by entry type. The bare word is forbidden in prose by ' +
      "nouns.md's vague-term rule — qualify it at the point of use. Kept here because the links " +
      'relate it and the type name is an identifier, which that rule exempts.',
  },
  {
    name: 'Location',
    status: 'live',
    definedIn: 'nouns.md § The spine',
    note:
      'A physical place with no members of its own. In the spine rather than the ships table, ' +
      'which is a gap in that file and not a difference in status: three built links relate it.',
  },
  {
    name: 'Place',
    status: 'live',
    definedIn: 'nouns.md § The nouns that ship',
    note:
      'Platform-curated geography, neighbourhood up to state. Nobody adds a Place and there is no ' +
      'member-facing create surface — which is exactly why the Location-is-in-a-Place link has no ' +
      'writer in the action layer, rather than that being an omission.',
  },
  {
    name: 'Announcement',
    status: 'live',
    definedIn: 'nouns.md § The nouns that are coming',
    note:
      'A Page telling the people attached to it what is upcoming. DISAGREES WITH nouns.md, which ' +
      'still marks it postponed: it is built here — page_posts, written by group.post_create and ' +
      'group.post_edit, and read by browse. Declared live because a built link relates it, and ' +
      'that file needs the correction. Named Announcement, never Post: bare "post" is on the ' +
      'vague-term watch list for meaning a row in one breath and the act in the next.',
  },
  {
    name: 'Tag',
    status: 'live',
    definedIn: 'nouns.md § The nouns that are coming',
    note:
      'A creator\'s own word for what their Page is — the only vocabulary a creator authors, and ' +
      'what search matches. DISAGREES WITH nouns.md, which marks it postponed and says there is ' +
      'no store: page_tags and tags both exist and group.activate writes them. Collections, ruled ' +
      '2026-09-19, are platform vocabulary and a different thing entirely.',
  },
] as const

/**
 * The words that name a relation to a Page, not a kind of person. Never nouns.
 *
 * "Member" was on Don's list too and is the exception, because it is doing two
 * jobs: the ACCOUNT (one real human, the object type above) and the RELATION
 * (a member of a Page, which is group_memberships). Only the second is a role,
 * and it is a link. That collision is worth knowing before someone reads the
 * object type as "a person who is a member of something".
 */
export const REJECTED_AS_NOUNS = [
  'Person',
  'Creator',
  'Organizer',
  'Follower',
  'Patron',
  'Vendor',
] as const

export function objectType(name: ObjectTypeName): ObjectType {
  return OBJECT_TYPES.find((o) => o.name === name)!
}
