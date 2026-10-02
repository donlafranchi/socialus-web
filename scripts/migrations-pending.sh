#!/usr/bin/env bash
# What the SELECTED REF would apply to production, and — when the answer is
# nothing — which refs would apply something.
#
# WHY THIS EXISTS. The apply workflow is `workflow_dispatch`, so GitHub offers a
# "Use workflow from" dropdown that defaults to `main`. A migration under review
# lives on its branch, not on main, so accepting the default runs the job
# against a ref with nothing pending: `supabase db push` says "Remote database
# is up to date", the job goes green, and the migration is not applied. Green
# and did-nothing are indistinguishable from the run list. That cost two round
# trips before this script existed.
#
# The fix is not a reminder in a PR body — that relies on a person reading and
# remembering the thing they just forgot. The job refuses to be a silent no-op,
# and when it refuses it names the ref to pick instead.
#
# Needs SUPABASE_DB_URL. Prints to stdout; exit 0 = something to apply,
# exit 3 = nothing on this ref, exit 2 = could not tell.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required}"

# Local migration versions on the ref that is checked out right now.
local_versions="$(ls supabase/migrations/*.sql 2>/dev/null \
  | xargs -n1 basename 2>/dev/null \
  | sed -E 's/^([0-9]+)_.*$/\1/' | sort -u)"

# Remote history, straight from the database. Same connection path as the
# drift check — no `supabase link`, which cannot resolve a service-role secret
# from a scoped token (supabase/supabase#50244).
#
# KEEP BOTH HANDS OFF THE CELL FORMAT. `supabase migration list` renders its
# table as markdown when stdout is not a TTY, so in CI every cell arrives
# backtick-wrapped — ` `20260917210000` ` — while the same command in a
# terminal prints bare digits. The first version of this parser stripped
# spaces and then required ^[0-9]+$, which the backticks defeat: the remote
# history came back empty on every CI run and the script took its
# refuse-to-guess branch, one step before `db push`, with the full table
# printed in the step above it (run 35469653868). So: take the digits out of
# column 2 and ignore every decoration around them.
remote_raw="$(supabase migration list --db-url "$SUPABASE_DB_URL" 2>&1)"
remote_status=$?

remote_versions="$(printf '%s\n' "$remote_raw" \
  | awk -F'|' 'NF>2 { v=$2; gsub(/[^0-9]/,"",v); if (v != "") print v }' | sort -u)"

if [ -z "$remote_versions" ]; then
  echo "::error::Could not read the remote migration history. Not proceeding — refusing to guess."
  echo
  # The original failure printed the line above and nothing else, which said
  # only that something was wrong. Whatever the CLI said goes in the log.
  echo "supabase migration list exited $remote_status and said:"
  printf '%s\n' "$remote_raw" | sed 's/^/  /'
  exit 2
fi

pending="$(comm -23 <(echo "$local_versions") <(echo "$remote_versions"))"

# #264: the guard after this step reads what would be applied from here.
[ -n "${PENDING_OUT:-}" ] && printf '%s\n' "$pending" > "$PENDING_OUT"

if [ -n "$pending" ]; then
  echo "This ref has $(echo "$pending" | wc -l | tr -d ' ') migration(s) to apply:"
  echo
  for v in $pending; do
    f="$(ls supabase/migrations/"$v"_*.sql 2>/dev/null | head -1)"
    echo "  $v  $(basename "${f:-unknown}")"
  done
  echo
  exit 0
fi

# Nothing here. Say which ref DOES have something, rather than only "no".
echo "::error::Nothing to apply from this ref — every migration on it is already in production."
echo
echo "This is almost always the wrong-ref mistake: the dropdown defaults to main,"
echo "and a migration under review lives on its branch until the PR merges."
echo

# Newest first, and capped. 43 remote branches is a wall of text, and the one
# Don wants is nearly always the branch of the PR he just read — which is the
# most recently pushed. A wall he scrolls past is the same as no message.
found=""
shown=0
MAX_REFS=5
for ref in $(git for-each-ref --sort=-committerdate --format='%(refname:short)' refs/remotes/origin \
             | grep -v 'origin/HEAD' | sed 's#^origin/##'); do
  [ "$shown" -ge "$MAX_REFS" ] && break
  vs="$(git ls-tree --name-only "origin/$ref" supabase/migrations/ 2>/dev/null \
        | xargs -n1 basename 2>/dev/null \
        | sed -E 's/^([0-9]+)_.*$/\1/' | sort -u)"
  [ -z "$vs" ] && continue
  extra="$(comm -23 <(echo "$vs") <(echo "$remote_versions"))"
  if [ -n "$extra" ]; then
    found="yes"
    shown=$((shown + 1))
    echo "  $ref — $(echo "$extra" | wc -l | tr -d ' ') pending:"
    for v in $extra; do
      f="$(git ls-tree --name-only "origin/$ref" supabase/migrations/ | grep "/${v}_" | head -1)"
      echo "      $v  $(basename "${f:-unknown}")"
    done
  fi
done

if [ -z "$found" ]; then
  echo "  No branch has an unapplied migration. Production is up to date with every ref."
  echo "  Nothing needs running."
else
  echo
  echo "Re-run it from one of the branches above: gh workflow run apply.yml --ref <branch>"
  echo "(Newest first, at most $MAX_REFS shown.)"
fi
exit 3
