#!/usr/bin/env bash
# Fails when the local migration files and the remote migration history
# disagree — a row present on one side and not the other.
#
# This is the specific failure it exists to catch: on 2026-09-11 two
# migrations were applied through the Supabase *management API*, which
# records a row named after whatever it was handed and never reads
# supabase/migrations/. Local and remote drifted silently, and nothing
# noticed until someone ran `migration list` by hand.
#
# Reads `supabase migration list`. Needs SUPABASE_DB_URL — a Postgres
# connection string, built by scripts/supabase-db-url.sh — and talks straight
# to the database. It deliberately does NOT use `supabase link`: link resolves
# the project's service-role secret through the Management API, which a scoped
# access token cannot do (supabase/supabase#50244), and migration history is a
# table in the database, not an API key. Prints the table either way, so the
# job log carries the record.
#
# Two modes:
#   (default)  remote-only migrations fail. Local-only ones are reported and
#              pass — a PR that adds a migration is supposed to have one.
#   --strict   local-only migrations fail too. Used by the scheduled check,
#              where a migration sitting on main unapplied is the problem
#              being watched for, not a normal in-flight state.
#
# Exit codes — distinct because the two failures need opposite fixes (#224):
#   0  clean
#   1  could not run (no connection string, CLI error)
#   2  pending: a file here the database has not applied (--strict only)
#   3  drift: the database has a migration with no file here
set -uo pipefail

STRICT=0
[ "${1:-}" = "--strict" ] && STRICT=1
pending=0

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "check-migration-drift: SUPABASE_DB_URL is not set." >&2
  echo "  It is built by scripts/supabase-db-url.sh, which names whichever" >&2
  echo "  secret is at fault. If that step was skipped, this one cannot run." >&2
  exit 1
fi

OUT="$(supabase migration list --db-url "$SUPABASE_DB_URL" 2>&1)"
status=$?

echo "$OUT"
echo

if [ $status -ne 0 ]; then
  echo >&2
  echo "check-migration-drift: could not read the migration history from the database." >&2
  echo "  The connection succeeded, so this is not a credentials problem." >&2
  echo "  The CLI's own message is in the output above." >&2
  exit 1
fi

# Rows look like:  ' 039  | 039  | 2026-… '   — local | remote | time
# An unmatched row leaves one of the first two columns empty.
#
# BACKTICKS, NOT JUST SPACES — bug #209, and it made all three checks built on
# this script inert.
#
# `supabase migration list` emits a MARKDOWN table when stdout is not a TTY, so
# in CI every cell arrives backtick-wrapped and an ABSENT cell arrives as
# '` `'. Stripping only whitespace left that as two backticks, which is
# non-empty, so an unapplied migration was classified as neither local-only nor
# remote-only and the script reported "clean". In a terminal the CLI renders
# the same table without backticks, which is why it worked by hand for weeks.
#
# This is the same bug that broke run 35469653868 on 2026-09-19. That one was
# fixed in scripts/migrations-pending.sh and pinned by
# tests/migrations-pending-parse.test.ts. THIS FILE HAS THE SAME PARSER AND WAS
# NOT FIXED — same bug, two files, one of them repaired. There is now an
# executing test over this one too, for the same reason its sibling has one: a
# grep cannot see a parse bug.
local_only=()
remote_only=()

while IFS= read -r line; do
  case "$line" in
    *'|'*) ;;
    *) continue ;;
  esac
  # Skip the header and the ---|---|--- separator.
  case "$line" in
    *Local*Remote*) continue ;;
    *---*) continue ;;
  esac

  l="$(printf '%s' "$line" | cut -d'|' -f1 | tr -d '[:space:]`')"
  r="$(printf '%s' "$line" | cut -d'|' -f2 | tr -d '[:space:]`')"

  if [ -n "$l" ] && [ -z "$r" ]; then local_only+=("$l"); fi
  if [ -z "$l" ] && [ -n "$r" ]; then remote_only+=("$r"); fi
done <<< "$OUT"

# Local-only is NOT drift. A PR that adds a migration is supposed to have a
# file the database has not seen yet — that is the whole point of the PR, and
# the apply job runs it on merge. Report it and pass.
if [ ${#local_only[@]} -gt 0 ]; then
  echo "check-migration-drift: ${#local_only[@]} migration(s) in supabase/migrations/ not yet applied:"
  printf '  %s\n' "${local_only[@]}"
  if [ "$STRICT" -eq 1 ]; then
    echo
    echo "check-migration-drift: FAILED — this checkout carries migrations the database does not." >&2
    echo "  Production is behind the repo. Apply them:" >&2
    echo "  In a terminal: gh workflow run apply.yml --ref <branch>" >&2
    pending=1
  else
    echo "  Expected on a PR. They apply when you run the apply workflow."
    echo
  fi
fi

# Remote-only IS drift, always. It means something wrote to the database
# without going through the files, so the repo is no longer the source of
# truth for the schema.
if [ ${#remote_only[@]} -eq 0 ]; then
  [ "$pending" -eq 1 ] && exit 2
  echo "check-migration-drift: clean — nothing applied that is missing a file here."
  exit 0
fi

echo "check-migration-drift: FAILED — the database has migrations this repo does not." >&2
if [ ${#remote_only[@]} -gt 0 ]; then
  echo "  Applied to the database with no file here: ${remote_only[*]}" >&2
  echo "  → something wrote to the database outside the migration files." >&2
  echo "    Do NOT run 'migration repair --status reverted' to make this go away:" >&2
  echo "    those migrations are applied, and re-running their DDL will fail partway." >&2
  echo "    If main already has the file, update this branch from main." >&2
  echo "    If main lacks it too, add the matching file, named for the version above." >&2
fi
exit 3
