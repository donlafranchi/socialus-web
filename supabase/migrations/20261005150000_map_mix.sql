-- #331 — the map's default is a tunable mix (Don, 2026-10-05: "map defaults
-- should be a mix … capture that somewhere where we can play with it … I don't
-- have a good answer without useful data").
--
-- app_settings: one row per tunable, read by the map query. The PM changes a
-- value in the Supabase dashboard; no deploy. Nothing writes it through the
-- API. map_mix starts with an even split across the four buckets.
--
-- map_mix_log: which bucket each shown pin came from, counted per day, so beta
-- data can tune the mix. No member id, no session: a day, a metro, a bucket and
-- the thing shown. Written server-side only.

create table public.app_settings (
  key        text        primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
create policy app_settings_select_signed_in on public.app_settings
  for select to authenticated using (true);
grant select on public.app_settings to authenticated;
revoke insert, update, delete, truncate on public.app_settings from anon, authenticated;

insert into public.app_settings (key, value) values (
  'map_mix',
  '{"cap": 60, "weights": {"dated": 1, "new": 1, "recent": 1, "interesting": 1}, "newDays": 30, "interesting": []}'::jsonb
);

create table public.map_mix_log (
  day         date        not null,
  metro_id    uuid        not null references public.metro_polygons(id) on delete cascade,
  bucket      text        not null check (bucket in ('dated', 'new', 'recent', 'interesting')),
  result_kind text        not null check (result_kind in ('page', 'post')),
  result_id   uuid        not null,
  shown       integer     not null default 1,
  primary key (day, metro_id, bucket, result_kind, result_id)
);
alter table public.map_mix_log enable row level security;
revoke all on public.map_mix_log from anon, authenticated;
