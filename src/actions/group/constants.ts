// T070 — Shared constants for group action handlers.
// #363 — the two types (ruled 2026-10-05); schema source is groups.kind's CHECK
// in 20261004130000_page_types. Use cases are presets: page-kind.ts.

export const GROUP_KINDS = ['business', 'group'] as const

export type GroupKind = (typeof GROUP_KINDS)[number]

// Placeholder for groups.name / group_businesses.display_name when the composer
// has not yet reached the brand-name step. group.activate refuses to promote a
// row that still carries this placeholder.
export const DRAFT_NAME_PLACEHOLDER = 'untitled-draft'

// T132 — groups.md § Roles per kind: business Groups are managed by
// role='owner', every other kind by role='steward'. The role a founder is
// assigned at group.create and the role group.update_draft requires to edit
// a draft are the same question — this is the one place both agree on the
// answer. Two SQL readers of group_memberships.role already branch the same
// way (member_has_standing_presence, member_public_has_published) — this
// function governs the write path only; a future change to the kind→role rule
// still needs updating in all three places.
export function managingRoleForKind(kind: GroupKind): 'owner' | 'steward' {
  return kind === 'business' ? 'owner' : 'steward'
}
