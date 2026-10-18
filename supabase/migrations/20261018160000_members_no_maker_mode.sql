-- #839 — F082 criterion 1: creator status is the rules agreement plus what a member has
-- authored; no account type, no stored role column, no mode flag. members.maker_mode_enabled
-- is that flag (migration 002), retired by ADR-12 and read by nothing since: no code, view,
-- function or policy uses it, and every row holds false. It goes, so nothing can start reading it.
-- Path: well-worn (drop a dead column once nothing reads it).

alter table public.members drop column if exists maker_mode_enabled;
