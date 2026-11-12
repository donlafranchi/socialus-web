#!/usr/bin/env bash
# Encrypts the backup directory with age, then proves the result decrypts and
# holds the dump (#1259, #1281). No pipes between tar and age: run 43284536056
# died with only "tar: stdout: write error" because age's side of a pipe gave
# no reason. Each tool now runs on its own, and its stderr is printed.
#
#   KEY_TEXT="$BACKUP_AGE_KEY" SRC=dir OUT=file.tar.age bash scripts/backup/encrypt.sh
#
# KEY_TEXT may be a whole `age-keygen -o` file (comment lines included), with
# CRLF line ends or stray blanks: only the AGE-SECRET-KEY-1 line is used.
set -euo pipefail
: "${KEY_TEXT:?KEY_TEXT is empty}"; : "${SRC:?}"; : "${OUT:?}"
umask 077
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
key="$work/age.key"

age --version | sed 's/^/age version: /'

printf '%s\n' "$KEY_TEXT" | tr -d '\r' | grep -E '^[[:space:]]*AGE-SECRET-KEY-1' | tr -d '[:space:]' > "$key" || true
lines="$(printf '%s\n' "$KEY_TEXT" | tr -d '\r' | grep -cE '^[[:space:]]*AGE-SECRET-KEY-1' || true)"
if [ "$lines" != 1 ]; then
  echo "::error::BACKUP_AGE_KEY should hold exactly one AGE-SECRET-KEY-1 line; it holds $lines. Make it with: age-keygen -o ~/socialus-backup.key"
  exit 1
fi
echo >> "$key"

if ! recipient="$(age-keygen -y "$key" 2> "$work/keygen.err")"; then
  echo "::error::age-keygen could not read the key: $(cat "$work/keygen.err")"
  exit 1
fi
if ! printf '%s' "$recipient" | grep -qE '^age1[0-9a-z]+$'; then
  echo "::error::The key's public half does not look like an age recipient (${#recipient} chars, starts '${recipient:0:5}')."
  exit 1
fi
echo "recipient: $recipient (public; safe to print)"

tar -C "$SRC" -cf "$work/backup.tar" .
echo "archive: $(du -h "$work/backup.tar" | cut -f1)"

if ! age -r "$recipient" -o "$OUT" "$work/backup.tar" 2> "$work/age.err"; then
  echo "::error::age failed to encrypt: $(cat "$work/age.err")"
  exit 1
fi
rm -f "$work/backup.tar"

if ! age -d -i "$key" -o "$work/check.tar" "$OUT" 2> "$work/age.err"; then
  echo "::error::The file just encrypted does not decrypt with the same key: $(cat "$work/age.err")"
  exit 1
fi
# Not `tar -t | grep -q`: grep -q exits at the first match, tar then writes
# into a closed pipe, and pipefail fails the step with "tar: stdout: write
# error". That, not age, was #1281.
tar -tf "$work/check.tar" > "$work/list.txt"
grep -qx './dump.pgc' "$work/list.txt" || { echo "::error::The encrypted archive has no dump.pgc."; exit 1; }
echo "encrypted: $(du -h "$OUT" | cut -f1), decrypts and holds dump.pgc"
