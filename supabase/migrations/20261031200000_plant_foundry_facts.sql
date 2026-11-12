-- Plant Foundry (Don, 2026-10-31): the nursery moved to 3621 Broadway. Its phone, hours and
-- links, from plantfoundry.com. Idempotent; touches only the unclaimed Page filed under that site.
-- Its street address is pinned by scripts/unclaimed/pin.ts (the row now names it).

update public.groups
   set contact_phone = '+19169175787',
       opening_hours = jsonb_build_object(
         'mon', '[{"open":"10:00","close":"17:00"}]'::jsonb,
         'tue', '[{"open":"10:00","close":"17:00"}]'::jsonb,
         'wed', '[{"open":"10:00","close":"17:00"}]'::jsonb,
         'thu', '[{"open":"10:00","close":"17:00"}]'::jsonb,
         'fri', '[{"open":"10:00","close":"17:00"}]'::jsonb,
         'sat', '[{"open":"09:00","close":"17:00"}]'::jsonb,
         'sun', '[{"open":"09:00","close":"17:00"}]'::jsonb),
       social_links = coalesce(social_links, '{}'::jsonb) || jsonb_build_object(
         'instagram', 'https://www.instagram.com/plantfoundry',
         'facebook', 'https://www.facebook.com/plantfoundry',
         'tiktok', 'https://www.tiktok.com/@plantfoundry',
         'youtube', 'https://www.youtube.com/@plantfoundry')
 where unclaimed_at is not null
   and public_info_url like 'https://plantfoundry.com/%';
