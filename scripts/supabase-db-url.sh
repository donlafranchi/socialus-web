#!/usr/bin/env bash
# Builds a Postgres connection string for the remote Supabase project, and
# prints it on stdout. Everything explanatory goes to stderr so the caller can
# do: DB_URL="$(bash scripts/supabase-db-url.sh)"
#
# Why this exists instead of `supabase link`:
#
#   `link` calls GET /v1/projects/{ref}/api-keys?reveal=true to resolve the
#   project's service-role SECRET. A scoped access token cannot reveal that —
#   supabase/supabase#50244 is open, and reports 403 even at Full access. So
#   every `link` in CI failed with "Your account does not have the necessary
#   privileges to access this endpoint", three token regenerations running.
#
#   Reading migration history needs the database, not API keys. `supabase
#   migration list --db-url` talks straight to Postgres and never asks for an
#   access token at all. That removes the whole class of failure.
#
# Why the pooler host and not db.<ref>.supabase.co:
#
#   The direct host publishes AAAA only — no A record. GitHub-hosted runners
#   are IPv4-only, so the direct host is unreachable from Actions. The
#   Supavisor pooler resolves to IPv4. This is asserted, not assumed: the
#   workflow logs both lookups before connecting.

set -uo pipefail

say() { echo "$@" >&2; }
die() { echo >&2; echo "ERROR: $*" >&2; exit 1; }

REF="${SUPABASE_PROJECT_REF:-}"
PASSWORD="${SUPABASE_DB_PASSWORD:-}"
REGION="${SUPABASE_DB_REGION:-us-west-2}"

# --- the three things that can be wrong, each named in words ----------------

if [ -z "$REF" ]; then
  die "SUPABASE_PROJECT_REF is empty or not set.
  Fix: GitHub → Settings → Secrets and variables → Actions → Repository
  secrets → SUPABASE_PROJECT_REF. It is the 20-character id in your Supabase
  dashboard URL: supabase.com/dashboard/project/<this-bit>."
fi

# Trailing whitespace in a pasted secret is invisible in the GitHub UI and
# produces a baffling auth error several steps later. Catch it here instead.
TRIMMED="$(printf '%s' "$REF" | tr -d '[:space:]')"
if [ "$TRIMMED" != "$REF" ]; then
  die "SUPABASE_PROJECT_REF has whitespace around it (a stray space or newline
  from pasting). Re-paste it with no leading or trailing blank."
fi
if ! printf '%s' "$REF" | grep -Eq '^[a-z]{20}$'; then
  die "SUPABASE_PROJECT_REF is not a valid project ref.
  Got ${#REF} character(s); expected exactly 20 lowercase letters.
  It is the id in supabase.com/dashboard/project/<this-bit> — not the project
  name, not the full URL."
fi

if [ -z "$PASSWORD" ]; then
  die "SUPABASE_DB_PASSWORD is empty or not set.
  This is the DATABASE password (Supabase → Project Settings → Database →
  Database password), NOT your Supabase account password and NOT the access
  token. If nobody knows it, reset it on that page — resetting is safe and
  does not affect the running app."
fi

# --- build the URL ----------------------------------------------------------

# The password is user-chosen and routinely contains @ : / ? # — all of which
# change the meaning of a connection string. Encode it rather than hoping.
ENCODED="$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$PASSWORD")" \
  || die "could not percent-encode the database password (python3 missing?)."

# Supavisor session mode on 5432. Username carries the ref: postgres.<ref>.
url_for() { echo "postgresql://postgres.${REF}:${ENCODED}@${1}:5432/postgres"; }

# Older projects sit on the aws-0 shard, newer ones on aws-1. Which one a
# project uses is not derivable from the ref, so try both and say which
# answered. socialus-db answered on aws-0-us-west-2 (verified 2026-09-13), so
# that is first; aws-1 stays as a fallback so a Supabase-side move needs no
# code change, only a slower first run.
CANDIDATES=("aws-0-${REGION}.pooler.supabase.com" "aws-1-${REGION}.pooler.supabase.com")

if ! command -v psql >/dev/null 2>&1; then
  die "psql is not installed, so the connection cannot be checked before use.
  GitHub's ubuntu runners ship it; a local run needs postgresql-client."
fi

say "Resolving how to reach the database"
say "  project ref : ${REF}"
say "  region      : ${REGION}  (override with SUPABASE_DB_REGION)"

# Evidence for the pooler choice, printed every run so the reason stays visible.
direct="db.${REF}.supabase.co"
say "  ${direct}"
say "    IPv4 (A)    : $(getent ahostsv4 "$direct" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ' | sed 's/^$/none — this is why the pooler is used/')"

for host in "${CANDIDATES[@]}"; do
  v4="$(getent ahostsv4 "$host" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')"
  if [ -z "$v4" ]; then
    say "  ${host}: no IPv4, skipping"
    continue
  fi
  say "  ${host}: IPv4 ${v4}— trying"
  if PGCONNECT_TIMEOUT=15 psql "$(url_for "$host")" -tAc 'select 1' >/dev/null 2>/tmp/pgerr; then
    say "  connected via ${host}"
    url_for "$host"
    exit 0
  fi
  err="$(tr -d '\r' </tmp/pgerr | head -3)"
  say "  ${host}: did not connect"
  say "    ${err}"
  # Supavisor's way of saying "this project is not on this shard". It is not a
  # credentials problem, and the message gives no hint of that.
  if printf '%s' "$err" | grep -q 'ENOTFOUND'; then
    say "    → that host does not host this project (wrong region or shard)."
  fi
  # A wrong password is conclusive — the other shard will not fix it, and
  # retrying only buries the real message under a second failure.
  if printf '%s' "$err" | grep -qiE 'password authentication failed|role .* does not exist'; then
    die "The database rejected the credentials.

  Almost always SUPABASE_DB_PASSWORD. It must be the DATABASE password from
  Supabase → Project Settings → Database → Database password — not your
  Supabase account password, and not the access token.

  Less likely: SUPABASE_PROJECT_REF names a different project. It is
  currently '${REF}'. The username the pooler needs is postgres.<ref>, so a
  wrong ref also reads as a bad login."
  fi
done

die "Could not reach the database on any pooler host.

  Tried: ${CANDIDATES[*]}
  Last error above.

  Most likely the region is wrong. Find it in Supabase → Project Settings →
  General → Region, then set SUPABASE_DB_REGION in the workflow to match
  (e.g. us-east-1, eu-west-2).

  If the region is right, check Supabase → Project Settings → Database →
  Network Restrictions has not been switched on — it blocks GitHub runners."
