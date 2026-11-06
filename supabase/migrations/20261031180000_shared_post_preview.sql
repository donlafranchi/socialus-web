-- Don, 2026-10-31 (B, #1126): a shared post's link preview is fetched signed out and shows the headline, the lead
-- line KIND · WHEN · WHERE and the photo; the details (the body) stay for members (F093). page_posts has no anonymous
-- read, so this is that one read: its return type has no body, and it answers only for a post that
-- announcements_withheld (20261019143000) would count for its Page, restated because security definer skips RLS,
-- and not hidden or removed.

create function public.shared_post_preview(p_group_id uuid, p_post_id uuid)
returns table (
  id             uuid,
  kind           text,
  headline       text,
  starts_at      timestamptz,
  ends_at        timestamptz,
  created_at     timestamptz,
  location_label text,
  photo_url      text,
  sample_kind    text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    pp.id,
    pp.kind,
    pp.headline,
    pp.starts_at,
    pp.ends_at,
    pp.created_at,
    l.label,
    case when pp.photo_hidden_at is null and pp.photo_removed_at is null then pp.photo_url end,
    pp.sample_kind
  from public.page_posts pp
  join public.groups g on g.id = pp.group_id
  left join public.locations l on l.id = pp.location_id and l.deleted_at is null
  where pp.id = p_post_id
    and pp.group_id = p_group_id
    and pp.lifecycle_state = 'active'
    and pp.discoverability = 'listed'
    and pp.dissolved_at is null
    and pp.hidden_at is null
    and pp.removed_at is null
    and g.lifecycle_state = 'active'
    and g.discoverability = 'listed'
    and g.dissolved_at is null
    and public.builder_visible(g.founder_member_id);
$$;

revoke all on function public.shared_post_preview(uuid, uuid) from public;
grant execute on function public.shared_post_preview(uuid, uuid) to anon, authenticated;

comment on function public.shared_post_preview(uuid, uuid) is
  '#1126 (Don, 2026-10-31, B) — a shared post as a signed-out reader previews it: headline, lead-line fields, photo. Never the body.';
