-- T137 — Findability follows what you've published.
-- Spec:   product/foundation/settled.md § findability (Ratified 2026-09-07)
-- Ticket: development/tickets/T137-findability-follows-publishing.md
--
-- The Member link on Item pages and the Shop "Founded by" line used to gate on
-- member_privacy.is_discoverable — an opt-in flag nobody was ever asked to flip
-- (the one-time prompt never shipped a surface). The ratified rule: people who
-- have published something are findable through what they made; people who
-- have published nothing are not. So the link derives from publishing, not from
-- a stored flag.
--
-- "Published" means running an active Page (an explicit managing-role
-- membership — owner/staff on a business Group, steward elsewhere — in a
-- Group that is active) or having a published Item. Joining someone else's
-- Group, a soft membership, or a draft Group puts nothing forward and does
-- not count: the protective direction stays protective.
--
-- Regular view → runs with owner privileges, so it bypasses group_memberships
-- RLS (owner/co-member only) the same way member_public_group_memberships does
-- in 029. Exposes only member_id for Members who qualify — never the row.
--
-- member_privacy.is_discoverable stays. It still governs indexing of the bare
-- person page and the not-yet-built people-search; this path simply no longer
-- reads it.

------------------------------------------------------------
-- 1. member_public_has_published (projection view)
------------------------------------------------------------

create or replace view public.member_public_has_published as
  select m.id as member_id
    from public.members m
   where m.deleted_at is null
     and (
       exists (
         select 1
           from public.group_memberships gm
           join public.groups g on g.id = gm.group_id
          where gm.member_id = m.id
            and gm.left_at is null
            and gm.source = 'explicit'
            and g.lifecycle_state = 'active'
            and g.dissolved_at is null
            and (
              (g.kind = 'business' and gm.role in ('owner','staff'))
              or (g.kind <> 'business' and gm.role = 'steward')
            )
       )
       or exists (
         select 1
           from public.items i
          where i.member_id = m.id
            and i.state = 'published'
            and i.deleted_at is null
       )
     );

comment on view public.member_public_has_published is
  'T137 — anon-readable projection: member_id for every Member holding an explicit managing-role membership in an active Group or ≥1 published Item. Drives the conditional Member link on Item attribution + Shop "Founded by". Replaces the opt-in flag read on that path. The flag itself is untouched.';

grant select on public.member_public_has_published to anon, authenticated;

------------------------------------------------------------
-- 2. member_prompts — the one-time discoverability prompt is deleted, not built
------------------------------------------------------------
-- Existed for exactly one prompt kind (discoverability_on_acquisition) and that
-- kind is gone. Production carries zero rows.

drop table if exists public.member_prompts;
