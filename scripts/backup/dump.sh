#!/usr/bin/env bash
# Takes one backup of production into $OUT_DIR, UNENCRYPTED. The workflow
# encrypts the whole directory before anything leaves the runner (#1259,
# INFRASTRUCTURE.md §10). Never upload what this writes as-is: the repo is public.
#
#   DB_URL=...  OUT_DIR=...  [MEDIA_BASE=https://<ref>.supabase.co]  bash scripts/backup/dump.sh
#
# Writes:
#   dump.pgc           pg_dump --no-owner --no-privileges -Fc
#   counts.tsv         exact row counts of public/auth/storage, from the SAME
#                      snapshot as the dump, so a restore can be checked exactly
#   media/             every object in the `media` bucket (Supabase's own
#                      backups do not include Storage objects)
#   media-objects.txt  the bucket's object names, from that same snapshot
#   media-missing.txt  names the database lists but Storage no longer has (404)
#   info.txt           when, server version, client version, sizes

set -euo pipefail

: "${DB_URL:?DB_URL is not set}"
: "${OUT_DIR:?OUT_DIR is not set}"
PG_BIN="${PG_BIN:-}"            # e.g. /usr/lib/postgresql/17/bin; empty = PATH
MEDIA_BASE="${MEDIA_BASE:-}"    # empty = skip media (local tests)
HERE="$(cd "$(dirname "$0")" && pwd)"

bin() { if [ -n "$PG_BIN" ]; then echo "$PG_BIN/$1"; else echo "$1"; fi; }
PSQL="$(bin psql)"
PG_DUMP="$(bin pg_dump)"

mkdir -p "$OUT_DIR/media"

# --- client must be at least the server's major version -----------------------
server_num="$("$PSQL" "$DB_URL" -qAtX -c 'show server_version_num')"
server_major=$((server_num / 10000))
client_major="$("$PG_DUMP" --version | grep -oE '[0-9]+' | head -1)"
echo "server Postgres $server_major, pg_dump $client_major"
if [ "$client_major" -lt "$server_major" ]; then
  echo "::error::pg_dump $client_major is older than the server ($server_major) and will refuse to dump. Bump the client the workflow installs."
  exit 1
fi

# --- one snapshot for the counts, the media list and the dump -----------------
# A psql session opens a read-only repeatable-read transaction and exports its
# snapshot; pg_dump --snapshot reads that exact state. Without this, a row
# written between the count and the dump makes the monthly restore test fail
# for a reason that is not a broken backup. Supavisor session mode keeps one
# server connection per client, so the export survives while the session does.
fifo_in="$(mktemp -u)"; mkfifo "$fifo_in"
snap_out="$(mktemp)"
"$PSQL" "$DB_URL" -qAtX -v ON_ERROR_STOP=1 < "$fifo_in" > "$snap_out" 2>&1 &
holder=$!
exec 9>"$fifo_in"
cleanup() { exec 9>&- 2>/dev/null || true; wait "$holder" 2>/dev/null || true; rm -f "$fifo_in" "$snap_out"; }
trap cleanup EXIT

{
  echo "begin isolation level repeatable read read only;"
  echo "select 'SNAPSHOT=' || pg_export_snapshot();"
  echo "\\o $OUT_DIR/counts.tsv"
  cat "$HERE/counts.sql"
  echo "\\o $OUT_DIR/media-objects.txt"
  echo "select name from storage.objects where bucket_id = 'media' order by name;"
  echo "\\o"
  echo "select 'READY';"
} >&9

for _ in $(seq 1 120); do
  grep -q '^READY$' "$snap_out" 2>/dev/null && break
  if ! kill -0 "$holder" 2>/dev/null; then cat "$snap_out" >&2; echo "::error::The snapshot session died."; exit 1; fi
  sleep 1
done
grep -q '^READY$' "$snap_out" || { cat "$snap_out" >&2; echo "::error::The snapshot session never got ready."; exit 1; }
snapshot="$(sed -n 's/^SNAPSHOT=//p' "$snap_out")"
echo "snapshot $snapshot; $(wc -l < "$OUT_DIR/counts.tsv") tables counted, $(wc -l < "$OUT_DIR/media-objects.txt") media objects listed"

# Supabase-managed schemas that are rebuilt by the platform, transient, or
# encrypted with a key that is not in the database (vault), so a copy of them
# restores nothing useful. public, auth, storage, extensions, cron and
# supabase_migrations are all kept.
"$PG_DUMP" "$DB_URL" --no-owner --no-privileges -Fc \
  --snapshot="$snapshot" \
  --exclude-schema=_analytics --exclude-schema=_realtime --exclude-schema=realtime \
  --exclude-schema=pgbouncer --exclude-schema=net --exclude-schema=supabase_functions \
  --exclude-schema=vault --exclude-schema=pgsodium --exclude-schema=pgsodium_masks \
  --exclude-schema=graphql --exclude-schema=graphql_public \
  -f "$OUT_DIR/dump.pgc"

echo "commit;" >&9
exec 9>&-
wait "$holder" || true
trap - EXIT
rm -f "$fifo_in" "$snap_out"

# --- media ---------------------------------------------------------------------
# The bucket is public (migration 039), so objects are fetched by their public
# URL: no service key needed. If it ever goes private this 400s/404s loudly.
: > "$OUT_DIR/media-missing.txt"
if [ -n "$MEDIA_BASE" ] && [ -s "$OUT_DIR/media-objects.txt" ]; then
  export MEDIA_BASE OUT_DIR
  # Exit 255 stops xargs at the first real failure; a 404 is recorded, not fatal
  # (a row whose object was already purged is the database's problem to report,
  # not a reason to have no backup tonight).
  tr '\n' '\0' < "$OUT_DIR/media-objects.txt" | xargs -0 -P 8 -n 1 bash -c '
    name="$1"
    enc="$(python3 -c "import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1]))" "$name")"
    dest="$OUT_DIR/media/$name"
    mkdir -p "$(dirname "$dest")"
    code="$(curl -sS -o "$dest" -w "%{http_code}" --retry 3 --max-time 120 "$MEDIA_BASE/storage/v1/object/public/media/$enc" || true)"
    case "$code" in
      200) ;;
      404|400) rm -f "$dest"; echo "$name" >> "$OUT_DIR/media-missing.txt" ;;
      *) echo "::error::media/$name: HTTP $code" >&2; exit 255 ;;
    esac
  ' _
fi
media_got="$(find "$OUT_DIR/media" -type f | wc -l)"
media_missing="$(wc -l < "$OUT_DIR/media-missing.txt")"
[ "$media_missing" -eq 0 ] || echo "::warning::$media_missing media object(s) listed in the database are gone from Storage (media-missing.txt)."

{
  echo "taken_at=$(date -u +%FT%TZ)"
  echo "server_version_num=$server_num"
  echo "pg_dump=$("$PG_DUMP" --version)"
  echo "dump_bytes=$(stat -c %s "$OUT_DIR/dump.pgc")"
  echo "tables=$(wc -l < "$OUT_DIR/counts.tsv")"
  echo "media_listed=$(wc -l < "$OUT_DIR/media-objects.txt")"
  echo "media_saved=$media_got"
  echo "media_missing=$media_missing"
} > "$OUT_DIR/info.txt"
cat "$OUT_DIR/info.txt"
