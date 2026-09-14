-- T159 (Issue #61) — F058's event rows are not readable by the Page's members.
--
-- Found building the handler, not specced: #61 says to write `group.reported`
-- to `group_events`, and `group_events` already carries
-- `group_events_select_member_of_group`, which lets any explicit member of a
-- Group read that Group's events. `group.create` makes the founder an explicit
-- member. So the specced write hands the reported party the `acting_member_id`
-- of the person who reported them, on the first read of their own Page.
--
-- Both halves of F058 forbid exactly that:
--   planning/scenario-F058.md acceptance 2 — "A submitted report changes
--     nothing visible to anyone, including the reported party."
--   Issue #62 — "A reporter whose identity leaks to the reported party is a
--     member-harm failure, not a polish bug."
--
-- The fix is the narrowest one that closes it: the three F058 event kinds drop
-- out of the member-readable policy. Nothing else about the policy changes.
--
-- What is deliberately NOT changed:
--   * `group_events_select_acting_self` (acting_member_id = auth.uid()) stays
--     as it is. It only ever returns a member their own rows, so it cannot
--     disclose a reporter to the party they reported.
--   * The event rows themselves. They are written, kept, and read server-side
--     by the operator surface (T122) over DATABASE_URL as the table owner,
--     which bypasses RLS. The audit trail is intact; only the browser read
--     path narrows.
--
-- The owner still learns their photo is hidden — from `groups.photo_hidden_at`,
-- which is what T160's notice renders. That tells them *that* and *why*, never
-- *who*, which is the split the ticket asks for.

drop policy if exists group_events_select_member_of_group on public.group_events;

create policy group_events_select_member_of_group
  on public.group_events
  for select
  using (
    group_id in (select current_member_explicit_group_ids())
    -- F058 moderation events name the reporter in acting_member_id. A Page's
    -- own members are precisely the audience that must never see them.
    and event_kind not in (
      'group.reported',
      'group.photo_hidden',
      'group.photo_restored'
    )
  );

comment on policy group_events_select_member_of_group on public.group_events is
  'Explicit members of a Group read that Group''s events, EXCEPT the three F058 moderation kinds. Those carry the reporter in acting_member_id, and the reported party is a member of their own Page — see 20260913211209_reports_and_photo_hiding.sql and tests/report-privacy-db.test.ts. The operator reads them server-side, bypassing RLS.';
