#!/usr/bin/env bash
# Installs what the backup and restore-test workflows need on an ubuntu-24.04
# runner: age (encryption) and the Postgres 17 client. PINNED to 17, the major
# production runs (supabase/config.toml major_version): pg_dump refuses to dump
# a server newer than itself, and the runner's default client is older. dump.sh
# re-checks this against the live server every run. Bump both together.
set -euo pipefail
PG_MAJOR="${PG_MAJOR:-17}"
if ! apt-cache show "postgresql-client-$PG_MAJOR" >/dev/null 2>&1; then
  # The PostgreSQL project's own apt repository (apt.postgresql.org), via the
  # helper postgresql-common ships for exactly this.
  sudo apt-get install -y -qq postgresql-common >/dev/null
  sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y >/dev/null
fi
sudo apt-get install -y -qq age "postgresql-client-$PG_MAJOR" >/dev/null
"/usr/lib/postgresql/$PG_MAJOR/bin/pg_dump" --version
age --version
