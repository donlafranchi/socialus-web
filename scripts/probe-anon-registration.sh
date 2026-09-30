#!/usr/bin/env bash
# #246 — asks PRODUCTION, as a stranger, whether a business registration's
# details are readable, and whether the "Claimed local owner" badge still
# resolves. Same method as probe-anon-identity.sh: key and URL from the served
# JavaScript. Counts and booleans only; no registration value is printed.
#
# Exits 1 while any detail column answers, or while no Page resolves the badge.
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

fail=0
for col in legal_entity_name zip state member_id; do
  read -r status range < <(curl -s -o /dev/null -D - \
    -H "apikey: $key" -H "Prefer: count=exact" -H "Range: 0-0" \
    "$url/rest/v1/member_business_jurisdictions?select=$col" |
    awk '/^HTTP\//{s=$2} tolower($1)=="content-range:"{r=$2} END{gsub(/\r/,"",r); print s, r}')
  rows="${range##*/}"
  if [[ "$status" =~ ^2 && "$rows" != "0" ]]; then
    echo "$col: readable (HTTP $status, $rows rows)"; fail=1
  else
    echo "$col: refused (HTTP $status${rows:+, $rows rows})"
  fi
done

ids="$(curl -s -H "apikey: $key" "$url/rest/v1/groups?select=id&lifecycle_state=eq.active" | grep -oE '[0-9a-f-]{36}' || true)"
badges=0
for id in $ids; do
  r="$(curl -s -H "apikey: $key" -H 'Content-Type: application/json' \
    -d "{\"p_group_id\":\"$id\"}" "$url/rest/v1/rpc/page_local_owner_badge")"
  [[ "$r" == "true" ]] && badges=$((badges + 1))
done
echo "badge: $badges of $(wc -w <<<"$ids" | tr -d ' ') active Pages resolve 'Claimed local owner'"
(( badges > 0 )) || { echo "badge: none resolves"; fail=1; }

if (( fail )); then
  echo "FAIL: registration details reach a stranger, or the badge does not resolve" >&2
  exit 1
fi
echo "PASS: details refused, badge resolves"
