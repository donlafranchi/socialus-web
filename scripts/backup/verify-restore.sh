#!/usr/bin/env bash
# Restores a decrypted backup into a brand-new database and proves it came back
# (#1259, INFRASTRUCTURE.md §10: "a backup you have never restored is a
# hypothesis"). The server is throwaway: the workflow's local Supabase Postgres,
# which has the same roles and extensions production does.
#
#   ADMIN_URL=postgresql://...  BUNDLE_DIR=...  bash scripts/backup/verify-restore.sh
#
# Passes only when every table counted at dump time exists after the restore
# with exactly the same number of rows, and every media object saved is in the
# bundle. pg_restore errors are printed but do not fail it by themselves: some
# platform objects (e.g. pg_cron, which only lives in the `postgres` database)
# cannot be recreated in a scratch database, and the row counts are the test of
# whether the data came back.

set -euo pipefail

: "${ADMIN_URL:?ADMIN_URL is not set}"
: "${BUNDLE_DIR:?BUNDLE_DIR is not set}"
PG_BIN="${PG_BIN:-}"
DB="${RESTORE_DB:-restore_test}"
HERE="$(cd "$(dirname "$0")" && pwd)"
bin() { if [ -n "$PG_BIN" ]; then echo "$PG_BIN/$1"; else echo "$1"; fi; }

for f in dump.pgc counts.tsv info.txt; do
  [ -s "$BUNDLE_DIR/$f" ] || { echo "::error::$f is missing or empty in the backup."; exit 1; }
done
cat "$BUNDLE_DIR/info.txt"

"$(bin psql)" "$ADMIN_URL" -qAtX -v ON_ERROR_STOP=1 \
  -c "drop database if exists $DB" -c "create database $DB"
target="$(python3 -c 'import sys,urllib.parse as u; p=u.urlsplit(sys.argv[1]); print(u.urlunsplit(p._replace(path="/"+sys.argv[2])))' "$ADMIN_URL" "$DB")"

set +e
"$(bin pg_restore)" --no-owner --no-privileges -d "$target" "$BUNDLE_DIR/dump.pgc" 2> restore-errors.log
rc=$?
set -e
errors="$(grep -c '^pg_restore: error' restore-errors.log || true)"
echo "pg_restore exit $rc, $errors error(s)"
grep '^pg_restore: error' restore-errors.log | head -40 || true

"$(bin psql)" "$target" -qAtX -v ON_ERROR_STOP=1 -f "$HERE/counts.sql" > restored-counts.tsv

if diff -u "$BUNDLE_DIR/counts.tsv" restored-counts.tsv > counts.diff; then
  echo "Row counts match for all $(wc -l < "$BUNDLE_DIR/counts.tsv") tables."
else
  # Tables that only exist after the restore (created by the scratch server's
  # own setup) are not a failure; a table that lost rows or vanished is.
  missing="$(grep -E '^-[^-]' counts.diff || true)"
  if [ -n "$missing" ]; then
    echo "::error::The restore does not match the dump's own counts. Lines starting '-' are what the dump had; '+' what came back:"
    cat counts.diff
    exit 1
  fi
  echo "Every counted table came back with the same rows; the scratch server also has:"
  grep -E '^\+[^+]' counts.diff || true
fi

listed="$(grep -c . "$BUNDLE_DIR/media-objects.txt" 2>/dev/null || true)"
missing_media="$(grep -c . "$BUNDLE_DIR/media-missing.txt" 2>/dev/null || true)"
saved="$(find "$BUNDLE_DIR/media" -type f 2>/dev/null | wc -l)"
expected=$(( ${listed:-0} - ${missing_media:-0} ))
if [ "$saved" -ne "$expected" ]; then
  echo "::error::Media: $saved files in the backup, expected $expected ($listed listed, $missing_media already gone from Storage)."
  exit 1
fi
echo "Media: all $saved objects present."
