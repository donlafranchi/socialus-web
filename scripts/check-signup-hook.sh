#!/usr/bin/env bash
# Is production's auth-signup hook wired up? Read-only, and it never prints a
# secret value — see .github/workflows/signup-hook-readiness.yml for why this
# exists and what it deliberately does not do.
#
# Exits non-zero when the hook cannot possibly work, so a run that goes green
# means something rather than meaning the script ran.
set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required}"

psql() { command psql "$SUPABASE_DB_URL" -tAX -c "$1"; }

fail=0
say() { printf '%s\n' "$*"; }

say "== the trigger =="
# Does the trigger exist at all, and is it enabled? `tgenabled = 'D'` is a
# disabled trigger, which looks present in every listing and fires never.
trigger=$(psql "
  select coalesce(
    (select case when tgenabled = 'D' then 'DISABLED' else 'enabled' end
       from pg_trigger
      where tgrelid = 'auth.users'::regclass
        and tgname = 'on_auth_user_created'
        and not tgisinternal
      limit 1),
    'MISSING')")
say "on_auth_user_created: $trigger"
[ "$trigger" = "enabled" ] || fail=1

say ""
say "== the function =="
fn=$(psql "select count(*) from pg_proc where proname = 'handle_new_auth_user'")
say "handle_new_auth_user present: $fn"
[ "$fn" != "0" ] || fail=1

say ""
say "== the two Vault secrets =="
# NAMES ONLY. `vault.secrets` holds the encrypted column; we select `name` and
# nothing else, and never touch `vault.decrypted_secrets`. A missing secret is
# the documented silent-failure path.
for name in auth_signup_hook_url auth_signup_hook_secret; do
  present=$(psql "select count(*) from vault.secrets where name = '$name'")
  if [ "$present" = "0" ]; then
    say "$name: MISSING  <-- the hook returns a WARNING and creates no members row"
    fail=1
  else
    say "$name: present"
  fi
done

say ""
say "== has it actually fired? =="
# pg_net records every response. If the hook has been working there are 2xx
# rows here; if it has been silently skipping there are none, whatever the
# secrets say.
if [ "$(psql "select count(*) from pg_class where relname = '_http_response' and relnamespace = 'net'::regnamespace")" = "0" ]; then
  say "net._http_response: not present (pg_net not installed?)"
  fail=1
else
  say "recent responses (status, when):"
  psql "
    select coalesce(status_code::text,'(none)') || '  ' || coalesce(created::text,'')
      from net._http_response
     order by created desc
     limit 5" | sed 's/^/  /'
  recent=$(psql "select count(*) from net._http_response where created > now() - interval '90 days'")
  say "responses in the last 90 days: $recent"
fi

say ""
say "== members without an auth user, and the reverse =="
# The reverse is the symptom this whole thing is about: an auth.users row with
# no members row is a person who signed up and cannot finish onboarding.
orphaned=$(psql "
  select count(*) from auth.users u
   where u.id <> '00000000-0000-0000-0000-000000000001'
     and not exists (select 1 from public.members m where m.id = u.id)")
say "auth users with NO members row: $orphaned"
[ "$orphaned" = "0" ] || say "  ^ each of these is someone who cannot complete onboarding"

say ""
if [ "$fail" -ne 0 ]; then
  say "RESULT: the signup hook CANNOT work as configured. See the lines marked above."
  exit 1
fi
say "RESULT: the signup hook is wired up."
