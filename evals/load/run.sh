#!/bin/bash
# #1261 — the load simulation (socialus-ops process/PERFORMANCE.md § Load simulation).
#   npm run load                                  everything: 50, 200 and 1,000 viewers signed out and in, the ♡ burst, the report burst
#   LOAD_LEVELS="50" LOAD_SCENARIOS="view-out" npm run load     one level
#
# Against THIS machine only: a local Supabase stack (started if it is not running)
# and a production build of the app on its own port. Never production.
# On the Mac: Docker Desktop only (desktop-linux context; never OrbStack), one
# build (counts against the four-at-once cap), no browsers. Needs k6 (brew install k6)
# and the Supabase CLI. Takes about 15 minutes.
#
# If the repo has .env files (the Mac's .env.local points at production and holds
# real keys), the app is built and served from a clean worktree of HEAD instead,
# so none of those values reach it. Uncommitted changes are not in that build.
#
# LOAD_PORT (3100), LOAD_OUT (load-out), LOAD_LEVELS ("50 200 1000"),
# LOAD_SCENARIOS ("view-out view-in tap report"), LOAD_SKIP_BUILD=1 to reuse a build,
# LOAD_GATE=1 to exit non-zero when a level breaks.
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="$PWD"
OUT="${LOAD_OUT:-load-out}"
PORT="${LOAD_PORT:-3100}"
LEVELS="${LOAD_LEVELS:-50 200 1000}"
SCENARIOS="${LOAD_SCENARIOS:-view-out view-in tap report}"
BASE="http://127.0.0.1:$PORT"

if [ "$(uname)" = Darwin ]; then
  if [ "$(docker context show 2>/dev/null)" != desktop-linux ]; then
    docker context use desktop-linux || { echo "Docker Desktop's context is not available. Stopping: tell Don (never OrbStack)." >&2; exit 1; }
  fi
fi
for tool in docker supabase k6; do command -v "$tool" >/dev/null || { echo "$tool is not installed (k6: brew install k6)." >&2; exit 1; }; done

# #1269 — production signs sessions with an ES256 key, so the app checks who is signed in without asking
# the auth server; a default local stack signs with a shared secret and every check becomes a round trip.
# When this script starts the stack, it starts it from a copy of supabase/ with its own ES256 key, so the
# run measures production's path. A stack that is already running (the Mac's dev stack) is used as it is.
SB=(supabase)
STARTED_STACK=""
if ! supabase status >/dev/null 2>&1; then
  WORK="${TMPDIR:-/tmp}/socialus-load-stack"
  rm -rf "$WORK"; mkdir -p "$WORK"; cp -R supabase "$WORK/"
  # Its own project id, so its own containers and volume: never the dev stack's database.
  sed -i.bak -e 's|^# signing_keys_path = "./signing_keys.json"|signing_keys_path = "./signing_keys.json"|' \
    -e 's|^project_id = .*|project_id = "web-load"|' "$WORK/supabase/config.toml"
  echo '[]' > "$WORK/supabase/signing_keys.json"
  echo y | supabase gen signing-key --algorithm ES256 --workdir "$WORK" >/dev/null
  SB=(supabase --workdir "$WORK")
  STARTED_STACK=1
  (cd "$WORK" && bash "$ROOT/scripts/supabase-start.sh" -x realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor)
fi
eval "$("${SB[@]}" status -o env | sed -n 's/^\([A-Z_]*\)=/export \1=/p')"
curl -s "${API_URL:-}/auth/v1/.well-known/jwks.json" | grep -q '"ES256"' || echo "Note: this stack signs sessions with a shared secret, so every sign-in check is a round trip to the auth server; production's are not." >&2
export SUPABASE_URL="${API_URL:?supabase status gave no API_URL}"
export SUPABASE_ANON_KEY="${ANON_KEY:?}" SUPABASE_SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY:?}"
export DATABASE_URL="${DB_URL:?}"
case "$SUPABASE_URL$DATABASE_URL" in *supabase.co*|*pooler.supabase.com*) echo "Not a local stack. Stopping." >&2; exit 1;; esac

APP="$ROOT"
if ls -a | grep -E '^\.env(\..+)?$' | grep -qv '\.example$'; then
  APP="${TMPDIR:-/tmp}/socialus-load-app"
  git worktree remove --force "$APP" >/dev/null 2>&1 || rm -rf "$APP"
  git worktree add --force --detach "$APP" HEAD >/dev/null
  ln -s "$ROOT/node_modules" "$APP/node_modules"
  echo "Building from a clean worktree of HEAD ($APP): this repo has .env files the load run must not use."
fi
build_env=(NEXT_PUBLIC_SUPABASE_URL="$SUPABASE_URL" NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$SUPABASE_ANON_KEY" NEXT_PUBLIC_MAPBOX_TOKEN="${NEXT_PUBLIC_MAPBOX_TOKEN:-pk.load_placeholder}")
[ "${LOAD_SKIP_BUILD:-}" = 1 ] || (cd "$APP" && env "${build_env[@]}" npm run build)

rm -rf "$OUT"; mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)" # absolute: k6 resolves open() against the script's folder
APP_PID=""; WATCH_PID=""
cleanup() {
  [ -n "$WATCH_PID" ] && kill "$WATCH_PID" 2>/dev/null || true
  [ -n "$APP_PID" ] && kill "$APP_PID" 2>/dev/null || true
  rm -f "$OUT/current"
  # The stack this run started goes with it (and its volume); a stack that was already running stays.
  [ -n "$STARTED_STACK" ] && "${SB[@]}" stop --no-backup >/dev/null 2>&1 || true
}
trap cleanup EXIT
# No production key reaches this server: emails, texts and AI moderation stay off.
( cd "$APP" && exec env -u RESEND_API_KEY -u ANTHROPIC_MODERATION_KEY -u TWILIO_ACCOUNT_SID -u TWILIO_AUTH_TOKEN "${build_env[@]}" \
    PORT="$PORT" DATABASE_URL="$DATABASE_URL" SUPABASE_URL="$SUPABASE_URL" SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
    node node_modules/next/dist/bin/next start -p "$PORT" ) > "$OUT/server.log" 2>&1 &
APP_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "$BASE/api/version" && break; sleep 1; done

LOAD_BASE_URL="$BASE" LOAD_APP_DIR="$APP" LOAD_OUT="$OUT" npx tsx evals/load/prepare.ts
LOAD_OUT="$OUT" npx tsx evals/load/watch.ts sample "$APP_PID" &
WATCH_PID=$!
ulimit -n 65536 2>/dev/null || true

run_level() { # name, then k6 -e args
  local name="$1"; shift
  echo "$name" > "$OUT/current"
  LOAD_OUT="$OUT" npx tsx evals/load/watch.ts reset
  local from start code=0
  from=$(wc -l < "$OUT/server.log"); start=$(($(date +%s) * 1000))
  k6 run --quiet --no-color -e FIXTURE="$OUT/fixture.json" -e OUT="$OUT" "$@" evals/load/k6.js || code=$?
  echo "{\"level\":\"$name\",\"start\":$start,\"end\":$(($(date +%s) * 1000)),\"logFrom\":$from,\"logTo\":$(wc -l < "$OUT/server.log"),\"exit\":$code}" >> "$OUT/marks.jsonl"
  LOAD_OUT="$OUT" npx tsx evals/load/watch.ts top "$name"
  : > "$OUT/current"
  sleep 10 # let the pool and the queue drain before the next level
}
for s in $SCENARIOS; do
  case "$s" in
    view-*) for n in $LEVELS; do run_level "$s-$n" -e SCENARIO="$s" -e VUS="$n"; done ;;
    *) run_level "$s" -e SCENARIO="$s" ;;
  esac
done

DB_POOL_MAX="${DB_POOL_MAX:-10}" npx tsx evals/load/summarize.ts "$OUT"
# A level k6 could not run (any exit but 0, or 99 for a broken threshold) is the harness failing: always red.
if grep -qvE '"exit":(0|99)}' "$OUT/marks.jsonl"; then echo "A level did not run; see above." >&2; exit 1; fi
if [ "${LOAD_GATE:-}" = 1 ] && grep -q '"firstBroken": {' "$OUT/result.json"; then exit 1; fi
