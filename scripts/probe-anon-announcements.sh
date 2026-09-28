#!/usr/bin/env bash
# F093 — asks PRODUCTION, as a stranger, whether it will hand over what an
# announcement says, or when, or where. URL and key come from the JavaScript the
# site serves, because that is what any stranger has. Nothing is kept.
#
#   1. `page_posts` must return no row to an anonymous select naming body,
#      starts_at and location_id.
#   2. `announcements_withheld`, asked for every Page, must return only the
#      allowed columns — an allow-list, so a column added later fails here.
#
# Exits 1 on a leak, 2 when inconclusive. SUPABASE_URL/KEY override the bundle,
# which is how this was observed failing: pointed at a local database with a
# key that bypasses RLS, it saw the bodies.
set -euo pipefail

SITE="${SITE:-https://www.socialus.org}"
ALLOWED='["announcement_count","announcement_ids","group_id","name","photo_url","public_id","result_id","slug","updated_at"]'
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT

url="${SUPABASE_URL:-}"; key="${SUPABASE_KEY:-}"
if [[ -z "$url" || -z "$key" ]]; then
  curl -sfL "$SITE/explore" -o "$tmp/page.html"
  grep -oE '/?_next/static/[^"'"'"' ]+\.js' "$tmp/page.html" | sed 's|^/||' | sort -u |
    while read -r chunk; do curl -sf "$SITE/$chunk" || true; done > "$tmp/bundle.js"
  url="$(grep -oE 'https://[a-z0-9]+\.supabase\.co' "$tmp/bundle.js" | sort -u | head -1)"
  key="$(grep -oE 'sb_publishable_[A-Za-z0-9_-]+' "$tmp/bundle.js" | sort -u | head -1)"
  [[ -n "$url" && -n "$key" ]] || { echo "could not find the Supabase URL and publishable key in $SITE's bundle" >&2; exit 2; }
fi
echo "origin: $url"

get() { curl -s -o "$tmp/out" -w '%{http_code}' -H "apikey: $key" -H "Authorization: Bearer $key" "$@"; }

status="$(get "$url/rest/v1/page_posts?select=id,body,starts_at,location_id&limit=1000")"
[[ "$status" =~ ^2 ]] || { echo "INCONCLUSIVE: page_posts refused (HTTP $status)" >&2; exit 2; }
leaked="$(jq 'length' "$tmp/out")"
echo "page_posts rows readable anonymously: $leaked"

status="$(get "$url/rest/v1/groups?select=id&lifecycle_state=eq.active&discoverability=eq.listed&limit=1000")"
[[ "$status" =~ ^2 ]] || { echo "INCONCLUSIVE: groups refused (HTTP $status)" >&2; exit 2; }
rows=0; bad=""
for gid in $(jq -r '.[].id' "$tmp/out"); do
  status="$(get -X POST -H 'Content-Type: application/json' -d "{\"p_group_id\":\"$gid\"}" "$url/rest/v1/rpc/announcements_withheld")"
  [[ "$status" =~ ^2 ]] || { echo "INCONCLUSIVE: announcements_withheld refused (HTTP $status)" >&2; exit 2; }
  rows=$(( rows + $(jq 'length' "$tmp/out") ))
  bad+="$(jq -r --argjson ok "$ALLOWED" '[.[] | keys[] | select(. as $k | $ok | index($k) | not)] | unique | join(",")' "$tmp/out")"
done
echo "withheld cards served: $rows; columns outside the allow-list: ${bad:-none}"

if (( leaked > 0 )) || [[ -n "$bad" ]]; then
  echo "FAIL: an anonymous caller can read what an announcement says, or when, or where" >&2
  exit 1
fi
(( rows > 0 )) || { echo "INCONCLUSIVE: no withheld card to inspect" >&2; exit 2; }
echo "PASS: no announcement body, time or place is readable anonymously"
