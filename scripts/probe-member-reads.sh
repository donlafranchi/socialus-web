#!/usr/bin/env bash
# #246 — asks PRODUCTION what a stranger can read about members: once signed
# out (anon) and once signed in with no relation to anyone (a random sub).
# Each check is one read inside a transaction that rolls back, run through the
# linked project's Management API. Counts only; nothing is printed or kept.
#
# Exits 1 while any route answers with a member's row, follows, interests,
# responses, a location's owner, a Page's roster or a member projection.
# Needs `supabase link` and a logged-in CLI.
set -uo pipefail

STRANGER="$(uuidgen | tr 'A-Z' 'a-z')"
leaks=0

# Handles to ask the profile resolver about, read as the owner and held in
# memory only. A stranger is not reading them; they are the input.
handles="$(supabase db query --linked --agent=no -o json \
  "select coalesce(string_agg(quote_literal(handle), ','), '''''') as h from public.members" 2>/dev/null |
  sed -n 's/.*"h": *"\(.*\)".*/\1/p')"
[[ -n "$handles" ]] || { echo "INCONCLUSIVE: could not read handles" >&2; exit 2; }

# Prints the count, or "denied" when the role may not read it at all.
ask() {
  local sub="$1" sql="$2" claims="" role="anon" out
  if [[ -n "$sub" ]]; then
    role="authenticated"
    claims="select set_config('request.jwt.claims', '{\"sub\":\"$sub\",\"role\":\"authenticated\"}', true);"
  fi
  out="$(supabase db query --linked --agent=no -o json \
    "begin; $claims set local role $role; select count(*) as n from ($sql) q; rollback;" 2>&1)"
  if grep -q 'permission denied' <<<"$out"; then echo denied; return; fi
  grep -oE '"n": *[0-9]+' <<<"$out" | grep -oE '[0-9]+' || { echo "error: $out" >&2; echo error; }
}

check() {
  local who="$1" label="$2" sql="$3" want="$4" got
  got="$(ask "$( [[ $who == stranger ]] && echo "$STRANGER" )" "$sql")"
  printf '%-9s %-44s %s\n' "$who" "$label" "$got"
  [[ "$got" == error ]] && { echo "INCONCLUSIVE: $label" >&2; exit 2; }
  if [[ "$want" == denied ]]; then
    [[ "$got" == denied ]] || leaks=1
  else
    [[ "$got" == denied || "$got" == 0 ]] || leaks=1
  fi
}

for who in anon stranger; do
  check "$who" 'members rows'              'select id from public.members'                            0
  check "$who" 'member_follows rows'       'select 1 from public.member_follows'                      0
  check "$who" 'member_interests rows'     'select 1 from public.member_interests'                    0
  check "$who" 'item_responses rows'       'select 1 from public.item_responses'                      0
  check "$who" 'locations.member_id'       'select member_id from public.locations'                   denied
  check "$who" 'group_memberships rows'    'select 1 from public.group_memberships'                   0
  check "$who" 'member_public_group_memberships' 'select member_id from public.member_public_group_memberships' denied
  check "$who" 'discoverable_items.member_handle' 'select member_handle from public.discoverable_items' denied
  check "$who" 'media bucket file list'         "select 1 from storage.objects where bucket_id = 'media'"   0
  check "$who" 'member_public_discoverability'   'select member_id from public.member_public_discoverability'   denied
  check "$who" 'member_has_standing_presence'    'select member_id from public.member_has_standing_presence'    denied
  check "$who" 'member_public_has_published'     'select member_id from public.member_public_has_published'     denied
  check "$who" 'profiles resolving to a member id' \
    "select 1 from unnest(array[$handles]::text[]) h, lateral public.resolve_member_page_visibility(h, true) v where v.member_id is not null" 0
done

if (( leaks )); then
  echo "FAIL: a stranger can still read about members" >&2
  exit 1
fi
echo "PASS: a stranger reads nothing about any member"
