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
# Reads `supabase migration list` (the project must already be linked).
# Prints the table either way, so the job log carries the record.
set -uo pipefail

OUT="$(supabase migration list 2>&1)"
status=$?

echo "$OUT"
echo

if [ $status -ne 0 ]; then
  echo "check-migration-drift: could not read the migration list (exit $status)." >&2
  exit 1
fi

# Rows look like:  ' 039  | 039  | 2026-… '   — local | remote | time
# An unmatched row leaves one of the first two columns empty.
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

  l="$(printf '%s' "$line" | cut -d'|' -f1 | tr -d '[:space:]')"
  r="$(printf '%s' "$line" | cut -d'|' -f2 | tr -d '[:space:]')"

  if [ -n "$l" ] && [ -z "$r" ]; then local_only+=("$l"); fi
  if [ -z "$l" ] && [ -n "$r" ]; then remote_only+=("$r"); fi
done <<< "$OUT"

# Local-only is NOT drift. A PR that adds a migration is supposed to have a
# file the database has not seen yet — that is the whole point of the PR, and
# the apply job runs it on merge. Report it and pass.
if [ ${#local_only[@]} -gt 0 ]; then
  echo "check-migration-drift: pending (expected) — in supabase/migrations/, not yet applied:"
  printf '  %s\n' "${local_only[@]}"
  echo "  These apply when this lands on main."
  echo
fi

# Remote-only IS drift, always. It means something wrote to the database
# without going through the files, so the repo is no longer the source of
# truth for the schema.
if [ ${#remote_only[@]} -eq 0 ]; then
  echo "check-migration-drift: clean — nothing applied that is missing a file here."
  exit 0
fi

echo "check-migration-drift: FAILED — the database has migrations this repo does not." >&2
if [ ${#remote_only[@]} -gt 0 ]; then
  echo "  Applied to the database with no file here: ${remote_only[*]}" >&2
  echo "  → something wrote to the database outside the migration files." >&2
  echo "    Do NOT run 'migration repair --status reverted' to make this go away:" >&2
  echo "    those migrations are applied, and re-running their DDL will fail partway." >&2
  echo "    Add the matching file instead, named for the version shown above." >&2
fi
exit 1
