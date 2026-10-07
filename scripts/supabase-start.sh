#!/bin/bash
# `supabase start`, retried. The CI runners pull Supabase's images from a
# registry that rate-limits shared addresses ("toomanyrequests: Rate exceeded"),
# which failed unrelated PRs. A retry after a pause clears it; a real failure
# still fails after the last attempt.
#
#   scripts/supabase-start.sh [supabase start flags]
#
# SUPABASE_START_ATTEMPTS (default 3), SUPABASE_START_BACKOFF seconds (default 30).
attempts="${SUPABASE_START_ATTEMPTS:-3}"
backoff="${SUPABASE_START_BACKOFF:-30}"
for i in $(seq 1 "$attempts"); do
  supabase start "$@"
  status=$?
  [ "$status" -eq 0 ] && exit 0
  echo "supabase start failed (attempt $i of $attempts)." >&2
  [ "$i" -lt "$attempts" ] || exit "$status"
  supabase stop --no-backup >/dev/null 2>&1 || true
  sleep "$backoff"
done
