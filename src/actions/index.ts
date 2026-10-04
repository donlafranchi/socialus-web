// T043 — Action layer registry
// Source: development/tickets/done/T043-*
//
// getHandler(name) resolves to a NamedActionHandler. The route layer calls
// this to dispatch action invocations. Adding a new handler is two lines:
// import + registry entry.

import {
  memberCreate,
  memberBusinessJurisdictionSet,
  memberBusinessJurisdictionRemove,
  memberPlaceInterestAdd,
  memberPlaceInterestRemove,
  memberInterestsAdd,
  memberFollow,
  memberUnfollow,
  memberSavedSearchRemove,
  memberSavedSearchRestore,
} from './member'
import {
  groupCreate,
  groupUpdateDraft,
  groupUpdate,
  groupActivate,
  groupMemberJoin,
  groupMemberLeave,
  groupFollow,
  groupUnfollow,
  groupPostCreate,
  groupPostEdit,
  groupPostDelete,
} from './group'
import { itemCreate, itemPublish, itemAttachLocation } from './item'
import { reportCreate, reportDecide, reportReverse } from './report'
import { metroWaitlistJoin, metroWaitlistJoinAnonymous } from './metro'
import type { NamedActionHandler } from './_lib/handler'

const REGISTRY: Record<string, NamedActionHandler<unknown, unknown>> = {
  'member.create': memberCreate as unknown as NamedActionHandler<unknown, unknown>,
  'group.create': groupCreate as unknown as NamedActionHandler<unknown, unknown>,
  'group.update_draft': groupUpdateDraft as unknown as NamedActionHandler<unknown, unknown>,
  // The owner edits a Page that is already live. Separate from update_draft
  // because a live Page's slug is frozen and the edit is an event.
  'group.update': groupUpdate as unknown as NamedActionHandler<unknown, unknown>,
  'group.activate': groupActivate as unknown as NamedActionHandler<unknown, unknown>,
  'item.create': itemCreate as unknown as NamedActionHandler<unknown, unknown>,
  'item.publish': itemPublish as unknown as NamedActionHandler<unknown, unknown>,
  'item.attach_location': itemAttachLocation as unknown as NamedActionHandler<unknown, unknown>,
  'member.business_jurisdiction.set': memberBusinessJurisdictionSet as unknown as NamedActionHandler<unknown, unknown>,
  'member.business_jurisdiction.remove': memberBusinessJurisdictionRemove as unknown as NamedActionHandler<unknown, unknown>,
  'member.place_interest.add': memberPlaceInterestAdd as unknown as NamedActionHandler<unknown, unknown>,
  'member.place_interest.remove': memberPlaceInterestRemove as unknown as NamedActionHandler<unknown, unknown>,
  'member.interests.add': memberInterestsAdd as unknown as NamedActionHandler<unknown, unknown>,
  'member.follow': memberFollow as unknown as NamedActionHandler<unknown, unknown>,
  'member.unfollow': memberUnfollow as unknown as NamedActionHandler<unknown, unknown>,
  // T109 — F042 management-page write paths (venue unfollow/restore + group leave/join)
  'member.saved_search.remove': memberSavedSearchRemove as unknown as NamedActionHandler<unknown, unknown>,
  'member.saved_search.restore': memberSavedSearchRestore as unknown as NamedActionHandler<unknown, unknown>,
  'group.member_leave': groupMemberLeave as unknown as NamedActionHandler<unknown, unknown>,
  'group.member_join': groupMemberJoin as unknown as NamedActionHandler<unknown, unknown>,
  // F067 — following a Page. Privacy decides follow vs join.
  'group.follow': groupFollow as unknown as NamedActionHandler<unknown, unknown>,
  'group.unfollow': groupUnfollow as unknown as NamedActionHandler<unknown, unknown>,
  // T164 — F072: a Page owner posts. There is no 'group.post_delete'.
  'group.post_create': groupPostCreate as unknown as NamedActionHandler<unknown, unknown>,
  'group.post_edit': groupPostEdit as unknown as NamedActionHandler<unknown, unknown>,
  // #318 — soft delete: hidden everywhere, kept for reports and audit.
  'group.post_delete': groupPostDelete as unknown as NamedActionHandler<unknown, unknown>,
  // T159 — F058: a member reports something; the photo hides at once.
  'report.create': reportCreate as unknown as NamedActionHandler<unknown, unknown>,
  // T122 (#12) — the operator's two outcomes. Operator-only, enforced in the
  // handlers; absence of a button is not authorization.
  // A decision is an event, not a state overwrite — `report.reverse` undoes any
  // past one by recording a new decision that points at it.
  'report.decide': reportDecide as unknown as NamedActionHandler<unknown, unknown>,
  'report.reverse': reportReverse as unknown as NamedActionHandler<unknown, unknown>,
  // T163 — F076: a person outside an open metro joins its waitlist.
  'metro.waitlist_join': metroWaitlistJoin as unknown as NamedActionHandler<unknown, unknown>,
  // T167 — F076 c13-15: the same step for someone with no account. Separate
  // handler because this one has no acting member to guard on at all.
  'metro.waitlist_join_anonymous': metroWaitlistJoinAnonymous as unknown as NamedActionHandler<unknown, unknown>,
}

export function getHandler(name: string): NamedActionHandler<unknown, unknown> | null {
  return REGISTRY[name] ?? null
}

export function listHandlers(): string[] {
  return Object.keys(REGISTRY).sort()
}

// Re-exports for convenience.
export {
  memberCreate,
  memberPlaceInterestAdd,
  memberInterestsAdd,
  memberFollow,
  memberUnfollow,
  memberBusinessJurisdictionSet,
  memberBusinessJurisdictionRemove,
  memberSavedSearchCreate,
  memberSavedSearchRemove,
  memberSavedSearchRestore,
} from './member'
export { groupCreate, groupUpdateDraft, groupUpdate, groupActivate, groupMemberJoin, groupMemberLeave } from './group'
export { groupFollow, groupUnfollow, relationshipFor, type Relationship } from './group'
export {
  groupPostCreate,
  groupPostEdit,
  groupPostDelete,
  groupPostCreateInput,
  groupPostEditInput,
  type GroupPostCreateInput,
  type GroupPostEditInput,
  type GroupPostCreateResult,
  type GroupPostEditResult,
} from './group'
export { itemCreate, itemPublish, itemAttachLocation } from './item'
export {
  reportCreate,
  reportDecide,
  reportReverse,
  reportCreateInput,
  type ReportCreateInput,
  type ReportCreateResult,
} from './report'
export {
  metroWaitlistJoin,
  metroWaitlistJoinInput,
  WAITLIST_ROLES,
  type WaitlistRole,
  type MetroWaitlistJoinInput,
  type MetroWaitlistJoinResult,
} from './metro'
export {
  metroWaitlistJoinAnonymous,
  metroWaitlistJoinAnonymousInput,
  type MetroWaitlistJoinAnonymousInput,
  type MetroWaitlistJoinAnonymousResult,
} from './metro'
export {
  ActionError,
  ValidationError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  TransientError,
  ACTION_ERROR_HTTP_STATUS,
  type ActionErrorCode,
} from './_lib/errors'
export { makeContext, type ActionContext, type ActingMemberId } from './_lib/context'
export { withTransaction, closePool } from './_lib/db'
