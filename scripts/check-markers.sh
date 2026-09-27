#!/usr/bin/env bash
# Checks the grammar of ops-pattern's inline markers wherever they sit in this repo:
#   `[open-question owner=<don|cowork|code> raised=YYYY-MM-DD] the question`
#   `[guards F093.4]` — on the check that discharges criterion 4 of scenario F093
# Grammar and meaning: ops-pattern `process/LIVING-DOCS.md` § Grep-built, never
# hand-kept. ops-pattern is private, so whether F093 criterion 4 exists is checked
# there, not here; this is the gate that repo cannot be.
#
#   bash scripts/check-markers.sh              # self-test, then every tracked file
#   bash scripts/check-markers.sh FILE...      # just these
#
# The self-test runs first: the checker must reject every line of the bad
# fixture and pass the good one, or it is inert and this fails
# ([guard-proves-itself]). A marker inside backticks is a mention.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

check() {
  python3 - "$@" <<'PY'
import datetime, re, sys
B = r"\["  # built from pieces so this file never contains a marker of its own
ANY_OQ = re.compile(B + r"open[- ]?question", re.I)
ANY_G = re.compile(B + r"guards?(?=[\s\]])", re.I)
ANY_B = re.compile(B + r"binds?(?=[\s\]])", re.I)
FULL_OQ = re.compile(B + "open-" + r"question owner=(\w+) raised=([0-9-]+)\]")
FULL_G = re.compile(B + r"guards F\d{3}\.\d+[a-z]?\]")
today, bad = datetime.date.today(), 0
def err(p, n, msg):
    global bad; bad += 1; print(f"marker: {p}:{n}: {msg}")
for p in sys.argv[1:]:
    try:
        lines = open(p, encoding="utf-8").read().splitlines()
    except (UnicodeDecodeError, IsADirectoryError, FileNotFoundError):
        continue
    for n, line in enumerate(lines, 1):
        bare = re.sub(r"`[^`]*`", lambda c: " " * len(c.group()), line)
        for m in ANY_OQ.finditer(bare):
            f = FULL_OQ.match(bare, m.start())
            if not f:
                err(p, n, "not an open-question marker: owner=<don|cowork|code> raised=YYYY-MM-DD"); continue
            if f.group(1) not in ("don", "cowork", "code"):
                err(p, n, f"owner={f.group(1)} is not don, cowork or code"); continue
            try:
                d = datetime.date.fromisoformat(f.group(2))
            except ValueError:
                err(p, n, f"raised={f.group(2)} is not a date"); continue
            if d > today:
                err(p, n, f"raised={f.group(2)} is in the future"); continue
            if not re.sub(r"(\*/|-->)\s*$", "", line[f.end():]).strip(" *_-—:\t"):
                err(p, n, "no question after the marker")
        for m in ANY_G.finditer(bare):
            if not FULL_G.match(bare, m.start()):
                err(p, n, "not a guards marker: one scenario criterion per marker, e.g. F093.4")
        for m in ANY_B.finditer(bare):
            err(p, n, "a binds tag belongs on an ops-pattern DECISIONS.md line, not here")
sys.exit(1 if bad else 0)
PY
}

if [ $# -gt 0 ]; then check "$@"; exit; fi

fx=scripts/fixtures/markers
EXPECT_BAD=12
got=$(check "$fx/bad.txt" | grep -c '^marker:')
if [ "$got" -ne "$EXPECT_BAD" ]; then
  echo "marker checker is inert — rejected $got of $EXPECT_BAD bad fixture lines"; exit 1
fi
check "$fx/good.txt" >/dev/null || { echo "marker checker rejects the good fixture"; exit 1; }

files=()
while IFS= read -r f; do files+=("$f"); done < <(git ls-files | grep -v "^$fx/")
check "${files[@]}"
