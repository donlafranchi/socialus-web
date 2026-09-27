#!/usr/bin/env bash
# Checks `[open-question owner=<don|cowork|code> raised=YYYY-MM-DD] question`
# markers. The grammar is ops-pattern's (`process/PIPELINE.md` § Open questions);
# its index scans this repo, and this is the gate that repo cannot be.
#
#   bash scripts/check-open-questions.sh              # self-test, then every tracked file
#   bash scripts/check-open-questions.sh FILE...      # just these
#
# The self-test runs first: the checker must reject every line of the bad
# fixture and pass the good one, or it is inert and this fails
# ([guard-proves-itself]). A marker inside backticks is a mention.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

check() {
  python3 - "$@" <<'PY'
import datetime, re, sys
ANY = re.compile(r"\[open[- ]?question", re.I)
FULL = re.compile(r"\[open-question owner=(\w+) raised=([0-9-]+)\]")
today, bad = datetime.date.today(), 0
def err(p, n, msg):
    global bad; bad += 1; print(f"open-question: {p}:{n}: {msg}")
for p in sys.argv[1:]:
    try:
        lines = open(p, encoding="utf-8").read().splitlines()
    except (UnicodeDecodeError, IsADirectoryError, FileNotFoundError):
        continue
    for n, line in enumerate(lines, 1):
        bare = re.sub(r"`[^`]*`", lambda c: " " * len(c.group()), line)
        for m in ANY.finditer(bare):
            f = FULL.match(bare[m.start():])
            if not f:
                err(p, n, "not `[open-question owner=<don|cowork|code> raised=YYYY-MM-DD]`"); continue
            if f.group(1) not in ("don", "cowork", "code"):
                err(p, n, f"owner={f.group(1)} is not don, cowork or code"); continue
            try:
                d = datetime.date.fromisoformat(f.group(2))
            except ValueError:
                err(p, n, f"raised={f.group(2)} is not a date"); continue
            if d > today:
                err(p, n, f"raised={f.group(2)} is in the future"); continue
            text = re.sub(r"(\*/|-->)\s*$", "", line[m.start() + f.end():]).strip(" *_-—:\t")
            if not text:
                err(p, n, "no question after the marker")
sys.exit(1 if bad else 0)
PY
}

if [ $# -gt 0 ]; then check "$@"; exit; fi

fx=scripts/fixtures/open-questions
EXPECT_BAD=8
got=$(check "$fx/bad.txt" | grep -c '^open-question:')
if [ "$got" -ne "$EXPECT_BAD" ]; then
  echo "open-question checker is inert — rejected $got of $EXPECT_BAD bad fixture lines"; exit 1
fi
check "$fx/good.txt" >/dev/null || { echo "open-question checker rejects the good fixture"; exit 1; }

files=()
while IFS= read -r f; do files+=("$f"); done < <(git ls-files | grep -v "^$fx/")
check "${files[@]}"
