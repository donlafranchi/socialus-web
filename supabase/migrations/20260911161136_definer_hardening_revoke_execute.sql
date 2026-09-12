-- 041 part 2 of 2 — issue #36, verified against local Postgres before merge.
-- These five are trigger bodies with no client caller anywhere in src/.
-- PostgreSQL checks EXECUTE on a trigger function when the trigger is CREATED,
-- not when it fires, so the triggers keep working with no grant at all.
revoke all on function public.handle_new_auth_user()                  from public, anon, authenticated;
revoke all on function public.create_member_privacy_defaults()        from public, anon, authenticated;
revoke all on function public.assert_member_id_in_auth_users()        from public, anon, authenticated;
revoke all on function public.sync_area_centroid()                    from public, anon, authenticated;
revoke all on function public.refresh_discoverable_items_on_publish() from public, anon, authenticated;

comment on function public.handle_new_auth_user is
  'F030/T044 signup hook — the only path to a Member row. SECURITY DEFINER over auth.users; EXECUTE revoked from PUBLIC/anon/authenticated (issue #36). Fires from the on_auth_user_created trigger, which does not re-check EXECUTE.';
