-- change #1127 (F117 criterion 7, ruled 2026-11-01): anyone who can see a Wonder sees who is in, by display
-- name. Adds `inNames` (newest first, at most 50; `total` carries the rest) for every viewer the projection
-- already answers. Sizes stay with the Page's managers in `people`. Visibility, SECURITY DEFINER and grants
-- are unchanged from 20261025120000_wonders.sql.
create or replace function public.wonder_view(p_post_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as id),
  w as (
    select p.id, p.group_id, p.wonder_threshold, p.wonder_options, p.wonder_in_count,
           p.group_id in (select public.current_member_managing_group_ids()) as manages
      from public.page_posts p
      join public.groups g on g.id = p.group_id
     where p.id = p_post_id
       and p.kind = 'wonder'
       and p.dissolved_at is null
       and (select id from me) is not null
       and (
         p.group_id in (select public.current_member_managing_group_ids())
         or (p.lifecycle_state = 'active' and p.discoverability = 'listed' and p.hidden_at is null and p.removed_at is null
             and g.lifecycle_state = 'active' and g.discoverability = 'listed' and g.dissolved_at is null)
       )
  )
  select jsonb_build_object(
    'total', w.wonder_in_count,
    'threshold', w.wonder_threshold,
    'options', to_jsonb(coalesce(w.wonder_options, '{}'::text[])),
    'mine', (select jsonb_build_object('option', i.option)
               from public.wonder_interest i where i.post_id = w.id and i.member_id = (select id from me)),
    'myOffers', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'role', o.role, 'status', o.status) order by o.created_at, o.role)
                            from public.wonder_offers o where o.post_id = w.id and o.member_id = (select id from me)), '[]'::jsonb),
    'helpers', coalesce((select jsonb_agg(jsonb_build_object('name', m.display_name, 'role', o.role) order by o.decided_at, o.role)
                           from public.wonder_offers o join public.members m on m.id = o.member_id
                          where o.post_id = w.id and o.status = 'accepted' and m.deleted_at is null), '[]'::jsonb),
    'inNames', coalesce((select jsonb_agg(n.display_name order by n.created_at desc, n.member_id)
                           from (select m.display_name, i.created_at, i.member_id
                                   from public.wonder_interest i join public.members m on m.id = i.member_id
                                  where i.post_id = w.id and m.deleted_at is null
                                  order by i.created_at desc, i.member_id
                                  limit 50) n), '[]'::jsonb)
  )
  || case when not w.manages then '{}'::jsonb else jsonb_build_object(
    'byOption', coalesce((select jsonb_agg(jsonb_build_object('option', u.opt, 'count',
                            (select count(*) from public.wonder_interest i where i.post_id = w.id and i.option = u.opt)) order by u.ord)
                            from unnest(w.wonder_options) with ordinality as u(opt, ord)), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(jsonb_build_object('name', m.display_name, 'option', i.option) order by i.created_at)
                          from public.wonder_interest i join public.members m on m.id = i.member_id where i.post_id = w.id), '[]'::jsonb),
    'offers', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', m.display_name, 'role', o.role, 'note', o.note, 'status', o.status)
                                         order by o.created_at, o.role)
                          from public.wonder_offers o join public.members m on m.id = o.member_id where o.post_id = w.id), '[]'::jsonb)
  ) end
  from w
$$;

revoke all on function public.wonder_view(uuid) from public;
grant execute on function public.wonder_view(uuid) to anon, authenticated;
