-- bug #918: Supabase default privileges grant EXECUTE on public functions to anon and authenticated, so the
-- revoke from public in 20261012060000_home_town.sql left this SECURITY DEFINER writer callable over PostgREST.
-- Guard in the function: anyone but service_role or a direct postgres connection writes nothing and gets 0.
create or replace function public.backfill_home_towns(p_market_key text)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if coalesce(current_setting('role', true), 'none') not in ('none', 'postgres', 'service_role') then
    return 0;
  end if;
  update public.members m
     set home_market_key = x.market_key, home_town = x.town_name, home_town_geoid = x.town_geoid
    from (select mm.id, h.market_key, h.town_geoid, h.town_name
            from public.members mm cross join lateral public.zip_home(mm.zip) h
           where mm.zip is not null and mm.deleted_at is null and h.market_key = p_market_key) x
   where m.id = x.id
     and (m.home_market_key is distinct from x.market_key or m.home_town is distinct from x.town_name);
  get diagnostics n = row_count;
  return n;
end $$;
