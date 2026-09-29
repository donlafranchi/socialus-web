#!/usr/bin/env bash
# Asks PRODUCTION, as a stranger, whether a public Page leads to the member
# behind it. Same method as probe-anon-members.sh: the key and URL come from the
# JavaScript the site serves. Counts only — ids are held in memory to follow the
# chain and are never printed or kept.
#
# Exits 1 while either route answers: the membership view keyed by Page slug,
# or groups.founder_member_id.
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

get() { curl -s -w '\n%{http_code}' -H "apikey: $key" "$url/rest/v1/$1"; }
status() { tail -n1 <<<"$1"; }
body() { sed '$d' <<<"$1"; }
ids() { grep -oE '"(member_id|founder_member_id)":"[0-9a-f-]{36}"' | cut -d'"' -f4 | sort -u; }

leaks=0

# (1) The membership view, asked the wrong way round: slug in, member ids out.
r="$(get 'groups?select=slug&slug=not.is.null&limit=50')"
slugs="$(body "$r" | grep -oE '"slug":"[^"]+"' | cut -d'"' -f4 || true)"
view_ids=""
for s in $slugs; do
  r="$(get "member_public_group_memberships?select=member_id&slug=eq.$s")"
  [[ "$(status "$r")" =~ ^2 ]] && view_ids+="$(body "$r" | ids)"$'\n'
done
n_view="$(grep -c . <<<"$view_ids" || true)"
echo "membership view: $n_view (member, Page) rows returned for $(wc -w <<<"$slugs" | tr -d ' ') Page slugs"
(( n_view > 0 )) && leaks=1

# (2) The founder column on groups.
r="$(get 'groups?select=founder_member_id&limit=1000')"
if [[ "$(status "$r")" =~ ^2 ]]; then
  founder_ids="$(body "$r" | ids || true)"
else
  founder_ids=""
  echo "groups.founder_member_id: refused (HTTP $(status "$r"))"
fi
n_founder="$(grep -c . <<<"$founder_ids" || true)"
echo "groups.founder_member_id: $n_founder distinct founder ids readable"
(( n_founder > 0 )) && leaks=1

# The chain: do those ids resolve to a member row a stranger can read?
all_ids="$(printf '%s\n%s\n' "$view_ids" "$founder_ids" | grep . | sort -u || true)"
if [[ -n "$all_ids" ]]; then
  list="$(paste -sd, - <<<"$all_ids")"
  r="$(get "members?select=id&id=in.($list)")"
  n_members="$(body "$r" | grep -oE '"id":"' | wc -l | tr -d ' ')"
  echo "chain: $n_members of $(grep -c . <<<"$all_ids") of those ids resolve to a members row (HTTP $(status "$r"))"
fi

if (( leaks )); then
  echo "FAIL: a public Page leads a stranger to the member ids behind it" >&2
  exit 1
fi
echo "PASS: neither route hands a stranger a member id"
