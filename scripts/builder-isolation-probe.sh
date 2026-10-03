#!/usr/bin/env bash
# #280 — asks PRODUCTION what a signed-out caller and a signed-in stranger can
# see of builder content. Each check is one read inside a transaction that
# rolls back, through the linked project's Management API. Counts only.
#
# Exits 1 when any route returns a builder's Page, post, item, follow, RSVP or
# membership. Needs `supabase link` and a logged-in CLI. Prints PASS (vacuous)
# when no builder has made anything yet, so run it again once they have.
set -uo pipefail

STRANGER="$(uuidgen | tr 'A-Z' 'a-z')"
leaks=0

owner() {
  supabase db query --linked --agent=no -o json "$1" 2>/dev/null | sed -n 's/.*"v": *"\(.*\)".*/\1/p'
}
builders="$(owner "select coalesce(string_agg(quote_literal(member_id), ','), 'null') as v from public.builders")"
pages="$(owner "select coalesce(string_agg(quote_literal(id), ','), 'null') as v from public.groups where founder_member_id in (select member_id from public.builders)")"
items="$(owner "select coalesce(string_agg(quote_literal(id), ','), 'null') as v from public.items where member_id in (select member_id from public.builders)")"
[[ -n "$builders" && -n "$pages" && -n "$items" ]] || { echo "INCONCLUSIVE: could not read the builder list" >&2; exit 2; }
metro="$(owner "select id::text as v from public.metro_polygons where slug = 'sacramento-roseville-ca'")"

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
  local who="$1" label="$2" sql="$3" got
  got="$(ask "$( [[ $who == stranger ]] && echo "$STRANGER" )" "$sql")"
  printf '%-9s %-40s %s\n' "$who" "$label" "$got"
  [[ "$got" == error ]] && { echo "INCONCLUSIVE: $label" >&2; exit 2; }
  [[ "$got" == denied || "$got" == 0 ]] || leaks=1
}

for who in anon stranger; do
  check "$who" 'Explore, search, map (browse_feed)' \
    "select 1 from public.browse_feed(p_metro_id => '$metro', p_limit => 100) f where f.group_id in ($pages)"
  check "$who" 'withheld-post cards' \
    "select 1 from public.announcements_withheld(p_metro_id => '$metro', p_limit => 100) w where w.group_id in ($pages)"
  check "$who" 'Pages, direct'          "select 1 from public.groups where id in ($pages)"
  check "$who" 'posts, direct'          "select 1 from public.page_posts where group_id in ($pages)"
  check "$who" 'items, direct'          "select 1 from public.items where id in ($items)"
  check "$who" 'item cards'             "select 1 from public.discoverable_items where item_id in ($items)"
  check "$who" 'follows and memberships' "select 1 from public.group_memberships where member_id in ($builders)"
  check "$who" 'RSVPs'                  "select 1 from public.item_responses where responder_member_id in ($builders)"
  check "$who" 'who is a builder'       "select 1 from public.builders"
done

if (( leaks )); then
  echo "FAIL: builder content is visible outside the builders" >&2
  exit 1
fi
echo "PASS: nothing a builder made answers a signed-out caller or a stranger"
