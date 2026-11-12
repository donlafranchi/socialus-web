#!/usr/bin/env bash
# Is socialus.org up, as a member would see it? (#1260, INFRASTRUCTURE.md §12)
#
# Each check is a KEYWORD check, not a bare 200: a page that renders its error
# state still answers 200. Every check gets three tries a minute apart before
# it counts as down, so one slow cold start does not page anyone.
#
#   bash scripts/uptime-check.sh              # the real checks
#   UPTIME_CHECKS='name|url|needle' bash ...  # override (used by the self-test)
#
# Exit 0 = all up. Exit 1 = something is down; the names and reasons are
# written to $UPTIME_OUT (default /tmp/uptime-down.txt), one per line.

set -uo pipefail

ORIGIN="${UPTIME_ORIGIN:-https://socialus.org}"
TRIES="${UPTIME_TRIES:-3}"
WAIT="${UPTIME_WAIT:-60}"
OUT="${UPTIME_OUT:-/tmp/uptime-down.txt}"

# name | url | text that only appears when the page really worked
DEFAULT_CHECKS="home page|${ORIGIN}/|<title>SocialUs
login page|${ORIGIN}/auth/login|name=\"email\"
database, from the app|${ORIGIN}/api/health/db|\"ok\":true"
CHECKS="${UPTIME_CHECKS:-$DEFAULT_CHECKS}"

: > "$OUT"
body="$(mktemp)"

check_once() { # url needle -> prints reason on failure
  local url="$1" needle="$2" code
  code="$(curl -sSL -o "$body" -w '%{http_code}' --max-time 30 -A 'socialus-uptime-check' "$url" 2>/dev/null || echo 000)"
  if [ "$code" != 200 ]; then echo "HTTP $code"; return 1; fi
  if ! grep -qF -- "$needle" "$body"; then echo "HTTP 200 but the page did not contain its expected text"; return 1; fi
  return 0
}

while IFS='|' read -r name url needle; do
  [ -n "$name" ] || continue
  try=1
  while :; do
    if reason="$(check_once "$url" "$needle")"; then
      echo "up:   $name ($url)"
      break
    fi
    if [ "$try" -ge "$TRIES" ]; then
      echo "DOWN: $name ($url): $reason, $TRIES tries"
      echo "$name — $url — $reason" >> "$OUT"
      break
    fi
    echo "      $name: $reason (try $try/$TRIES), retrying in ${WAIT}s"
    try=$((try + 1))
    sleep "$WAIT"
  done
done <<< "$CHECKS"

rm -f "$body"
[ ! -s "$OUT" ]
