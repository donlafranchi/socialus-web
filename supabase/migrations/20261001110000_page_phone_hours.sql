-- #293 — a Page's business phone and weekly opening hours (Don, 2026-10-01).
-- Shown to signed-in visitors only: the front door shows neither (F093
-- criterion 8). The member's own signup phone is a different thing, on the
-- login only (F081), and is never this.

alter table public.groups
  add column contact_phone text
    check (contact_phone ~ '^\+1[2-9][0-9]{9}$'),
  -- { "mon": [{ "open": "07:00", "close": "15:00" }], … } in the metro's wall
  -- clock. A missing day is closed or unstated. The handler checks the shape.
  add column opening_hours jsonb
    check (opening_hours is null or jsonb_typeof(opening_hours) = 'object');

-- groups is granted column by column (#254, #255), so a new column is read by
-- nobody until named here: signed-in callers only.
grant select (contact_phone, opening_hours) on public.groups to authenticated;
