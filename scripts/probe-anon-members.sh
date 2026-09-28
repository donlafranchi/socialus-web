#!/usr/bin/env bash
# #178 — asks PRODUCTION, as a stranger, whether it will hand over members that
# are marked private. The key and URL are taken from the JavaScript the site
# actually serves, because that is what any stranger has. Counts only: every
# request is `select=id` with `Prefer: count=exact` and `Range: 0-0`, and
# nothing is kept.
#
# Exits 1 while any non-public member row is readable anonymously. This is the
# acceptance check for #178 under [guard-proves-itself]: it was run, and
# observed failing, before the migration was applied.
set -euo pipefail

SITE="${SITE:-https://www.socialus.org}"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT

curl -sfL "$SITE/" -o "$tmp/page.html"
grep -oE '/?_next/static/[^"'"'"' ]+\.js' "$tmp/page.html" | sed 's|^/||' | sort -u |
  while read -r chunk; do curl -sf "$SITE/$chunk" || true; done > "$tmp/bundle.js"

url="$(grep -oE 'https://[a-z0-9]+\.supabase\.co' "$tmp/bundle.js" | sort -u | head -1)"
key="$(grep -oE 'sb_publishable_[A-Za-z0-9_-]+' "$tmp/bundle.js" | sort -u | head -1)"
[[ -n "$url" && -n "$key" ]] || { echo "could not find the Supabase URL and publishable key in $SITE's bundle" >&2; exit 2; }
echo "origin: $url (key from $SITE's served bundle)"

count() {
  local status range
  read -r status range < <(curl -s -o /dev/null -D - \
    -H "apikey: $key" -H "Prefer: count=exact" -H "Range: 0-0" \
    "$url/rest/v1/members?select=id$1" |
    awk '/^HTTP\//{s=$2} tolower($1)=="content-range:"{r=$2} END{gsub(/\r/,"",r); print s, r}')
  [[ "$status" =~ ^2 ]] || { echo "HTTP $status"; return; }
  echo "${range##*/}"
}

all="$(count '')"
private="$(count '&stakeholder_visibility=eq.private')"
community="$(count '&stakeholder_visibility=eq.community_only')"
public="$(count '&stakeholder_visibility=eq.public')"

printf 'anon can read members: %s  (private %s, community_only %s, public %s)\n' \
  "$all" "$private" "$community" "$public"

# A refused request proves nothing about the policy — it may be a stale key.
for n in "$all" "$private" "$community" "$public"; do
  [[ "$n" =~ ^[0-9]+$ ]] || { echo "INCONCLUSIVE: a request was refused ($n)" >&2; exit 2; }
done

if (( private > 0 || community > 0 )); then
  echo "FAIL: anonymous callers can read members who are not marked public" >&2
  exit 1
fi
echo "PASS: no non-public member row is readable anonymously"
