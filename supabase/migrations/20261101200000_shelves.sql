-- F121 — shelves are rows of data, tried by rotation and judged on a weekly scoreboard (approved 2026-10-31).
--   shelves        one row per shelf: a name, a query (read by src/lib/shelves/query.ts into browse_feed's
--                  arguments), a lead time in days, a place (fixed slot or rotating), season dates and an
--                  on/off. Adding, renaming or retiring a shelf is a row change, not a deploy. Anyone may read
--                  the ones that are on; nobody writes them through the API.
--   shelf_weekly   per shelf per week (Monday, Pacific): impressions, distinct members, taps, saves. No member id.
--   shelf_seen     sha256 dedupe keys: one impression per member per shelf per day, one member per shelf per week,
--                  one tap or save per member per card per day, at most a shelf's worth (12) of each per member per
--                  shelf per day (`bucket`, also a hash). Deleted after 8 days by the shelf.log handler, once no
--                  day or week can still need them. No hash reaches shelf_weekly.
-- Writes go through the action layer (ADR-7): shelf.log, which skips a member who turned logging off on You
-- (members.search_sharing) and every builder.

create table public.shelves (
  id           text        primary key check (id ~ '^[a-z0-9-]{2,60}$'),
  name         text        not null check (char_length(name) between 1 and 60),
  query        jsonb       not null default '{}'::jsonb check (jsonb_typeof(query) = 'object'),
  lead_days    int         check (lead_days between 1 and 90),
  place        text        not null check (place in ('fixed', 'rotating')),
  fixed_order  int,
  season_start date,
  season_end   date,
  kind         text        not null default 'query' check (kind in ('query', 'followed', 'interest')),
  enabled      boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check ((place = 'fixed') = (fixed_order is not null)),
  check ((season_start is null) = (season_end is null) and (season_start is null or season_start <= season_end))
);
comment on table public.shelves is
  'F121 — a shelf on Explore, as data. query keys: audience (following), datedOnly, startsFromDays, tags (Page or post tags, any), anyOf (words, any of them), postKinds. Names are draft copy (human-review).';

alter table public.shelves enable row level security;
create policy shelves_read on public.shelves for select to anon, authenticated using (enabled);
revoke all on public.shelves from anon, authenticated;
grant select on public.shelves to anon, authenticated;

create table public.shelf_weekly (
  shelf_id    text not null references public.shelves(id) on delete cascade,
  week_start  date not null,
  impressions int  not null default 0 check (impressions >= 0),
  members     int  not null default 0 check (members >= 0),
  taps        int  not null default 0 check (taps >= 0),
  saves       int  not null default 0 check (saves >= 0),
  primary key (shelf_id, week_start)
);

create table public.shelf_seen (
  key      text not null primary key,
  shelf_id text not null references public.shelves(id) on delete cascade,
  bucket   text,
  seen_on  date not null default current_date
);
create index shelf_seen_bucket on public.shelf_seen (bucket) where bucket is not null;
create index shelf_seen_on on public.shelf_seen (seen_on);

alter table public.shelf_weekly enable row level security;
alter table public.shelf_seen enable row level security;
revoke all on public.shelf_weekly, public.shelf_seen from anon, authenticated;

-- Staff: each shelf's weeks, newest first. Without metrics.view: no rows (as admin_search_demand).
create or replace function public.admin_shelf_scoreboard(p_weeks int default 8)
returns table (shelf_id text, name text, place text, season_end date, enabled boolean, week_start date,
               impressions int, members int, taps int, saves int)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.place, s.season_end, s.enabled, w.week_start, w.impressions, w.members, w.taps, w.saves
    from public.shelf_weekly w
    join public.shelves s on s.id = w.shelf_id
   where public.staff_can('metrics.view')
     and w.week_start >= (date_trunc('week', now() at time zone 'America/Los_Angeles'))::date
                         - 7 * (greatest(p_weeks, 1) - 1)
   order by w.week_start desc, s.id
$$;
revoke all on function public.admin_shelf_scoreboard(int) from public, anon;
grant execute on function public.admin_shelf_scoreboard(int) to authenticated;

-- The starting shelves: the followed shelf and Next 7 days first, then the catalog's starred rotation
-- (socialus-plan planning/research/shelves-and-rally-2026-10-31.md), two more things to buy from the same catalog so
-- there are three (criterion 6), and up to three interest shelves.
insert into public.shelves (id, name, query, lead_days, place, fixed_order, season_start, season_end, kind) values
  ('from-who-you-follow',            'From who you follow',             '{"audience":"following"}',                                                    14, 'fixed', 1, null, null, 'followed'),
  ('next-7-days',                    'Next 7 days',                     '{"datedOnly":true}',                                                           7, 'fixed', 2, null, null, 'query'),
  ('because-you-like',               'Because you like {interest}',     '{}',                                                                          14, 'rotating', null, null, null, 'interest'),
  ('meet-up-with-folks',             'Meet up with folks',              '{"anyOf":["meetup","social","club","potluck","mixer","neighbors"]}',           14, 'rotating', null, null, null, 'query'),
  ('go-out-and-play',                'Go out and play',                 '{"anyOf":["trail","river","paddle","kayak","park","hike","outdoors"]}',        14, 'rotating', null, null, null, 'query'),
  ('move-your-body',                 'Move your body',                  '{"anyOf":["run","ride","yoga","dance","swim","cycling","workout"]}',           14, 'rotating', null, null, null, 'query'),
  ('try-something-new',              'Try something new',               '{"anyOf":["beginner","intro","introduction","taster","diy","craft"]}',         14, 'rotating', null, null, null, 'query'),
  ('how-about-a-class',              'How about a class?',              '{"anyOf":["class","workshop","lesson","course"]}',                             14, 'rotating', null, null, null, 'query'),
  ('want-to-learn-something',        'Want to learn something?',        '{"anyOf":["talk","tour","museum","history","library","lecture","author"]}',   14, 'rotating', null, null, null, 'query'),
  ('play-with-farm-animals',         'Play with farm animals',          '{"anyOf":["goat","sheep","alpaca","llama","poultry","petting","barnyard"]}',   14, 'rotating', null, null, null, 'query'),
  ('whos-proposing-what',            'Who’s proposing what?',           '{"postKinds":["wonder"]}',                                                    null, 'rotating', null, null, null, 'query'),
  ('lend-a-hand',                    'Lend a hand',                     '{"tags":["volunteering"]}',                                                   14, 'rotating', null, null, null, 'query'),
  ('plan-ahead-next-month',          'Plan ahead: next month',          '{"datedOnly":true,"startsFromDays":14}',                                      42, 'rotating', null, null, null, 'query'),
  ('live-music-this-week',           'Live music this week',            '{"tags":["live music"],"datedOnly":true}',                                     7, 'rotating', null, null, null, 'query'),
  ('big-nights-out',                 'Big nights out',                  '{"anyOf":["theater","theatre","symphony","ballet","opera","arena","concert"],"datedOnly":true}', 14, 'rotating', null, null, null, 'query'),
  ('bakers-and-sweets',              'Bakers and sweets',               '{"anyOf":["bakery","bakers","pie","bread","pastry","chocolate","creamery"]}', 14, 'rotating', null, null, null, 'query'),
  ('plants-and-gardens',             'Plants and gardens',              '{"anyOf":["nursery","plant","plants","garden","flower","seedling"]}',         14, 'rotating', null, null, null, 'query'),
  ('fresh-from-the-farm',            'Fresh from the farm',             '{"tags":["farmers markets"]}',                                                14, 'rotating', null, null, null, 'query'),
  ('getting-ready-for-thanksgiving', 'Getting ready for Thanksgiving',  '{"anyOf":["thanksgiving","pie","turkey","harvest","gratitude"]}',               28, 'rotating', null, '2026-11-02', '2026-11-28', 'query');
