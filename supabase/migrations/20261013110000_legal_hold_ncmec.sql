-- #648 part 2 — the operator records the report number NCMEC gave back, who recorded it and when. Still
-- operator-only (the table has RLS on and no policy); recording it restarts the one-year keep (the handler).
alter table public.legal_holds
  add column ncmec_report_number text check (ncmec_report_number is null or char_length(ncmec_report_number) <= 60),
  add column ncmec_reported_at   timestamptz,
  add column ncmec_reported_by   uuid references public.members(id) on delete set null;
