// T070 — Group action handlers (barrel)
export {
  groupCreate,
  groupCreateInput,
  type GroupCreateInput,
  type GroupCreateResult,
} from './create'
export {
  groupUpdateDraft,
  groupUpdateDraftInput,
  type GroupUpdateDraftInput,
  type GroupUpdateDraftResult,
} from './update-draft'
export {
  groupActivate,
  groupActivateInput,
  type GroupActivateInput,
  type GroupActivateResult,
} from './activate'
// T109 — Membership join / leave (F042 management page + Undo)
export {
  groupMemberLeave,
  groupMemberLeaveInput,
  type GroupMemberLeaveInput,
  type GroupMemberLeaveResult,
} from './member-leave'
export {
  groupMemberJoin,
  groupMemberJoinInput,
  type GroupMemberJoinInput,
  type GroupMemberJoinResult,
} from './member-join'
// F067 — a Page can be followed. Privacy decides whether that is a follow or a join.
export {
  groupFollow,
  groupUnfollow,
  groupFollowInput,
  relationshipFor,
  type Relationship,
  type GroupFollowInput,
  type GroupFollowResult,
  type GroupUnfollowResult,
} from './follow'
// F072 — a Page owner posts. No delete handler, deliberately: acceptance 4
// refuses deletion, and the way to refuse it is to not build it.
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
} from './post'

export { groupUpdate, groupUpdateInput, type GroupUpdateInput, type GroupUpdateResult } from './update'
// #423 — the owner archives, deletes (14 days to restore) and restores a Page.
export {
  groupArchive,
  groupDelete,
  groupDiscardDraft,
  groupRestore,
  groupDeleteInput,
  DELETE_GRACE_DAYS,
  type GroupLifecycleResult,
  type PageLifecycleState,
} from './lifecycle'

// #353 — unclaimed Pages: remove (hides at once), claim (a contact form), restore (operator).
export {
  groupUnclaimedRemove,
  groupUnclaimedRemoveInput,
  groupUnclaimedClaim,
  groupUnclaimedClaimInput,
  groupUnclaimedRestore,
  groupUnclaimedRestoreInput,
  DAILY_LIMIT_PER_DEVICE,
  UNCLAIMED_REMOVAL_SCOPES,
  type UnclaimedRemovalScope,
} from './unclaimed'
