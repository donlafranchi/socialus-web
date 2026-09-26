# change #216 · The waitlist count comes back, cached, and metros sort by it

Reverses #196. Don overruled the no-count ruling and was largely right: the
oracle is real, and what it reveals does not justify what removing it cost.

## What changed, mechanically

The leak was never the number existing — it was the number being recomputed and
re-displayed **in response to your own write**. Read it before the write and two
submissions differ; read it after and a single probe differs.

`src/lib/metro/waitlist-counts.ts` serves a figure that is at most an hour old,
from Next's data cache, shared across instances on Vercel. Every surface reads
it: the popup after submitting, and the picker's ordering. A submission does not
move it, so there is nothing to difference.

Not `pg_cron` — not installed on this project, checked against
`pg_extension` rather than assumed, so a database-side refresh would have
needed the extension enabled in production before any of this could ship.

`metro_polygons.creator_count` / `patron_count` are already maintained
incrementally by the join handlers, so there was never a per-request
recomputation to remove — one cheap read of two columns, cached.

## The sort

Metros not yet open order by waiting count, most first, alphabetical tiebreak so
the long tail does not shuffle between refreshes. Same cached figure, and that
is the load-bearing part: a live count in a **sorted list** is a better oracle
than a live count in a popup, because it exposes every metro at once and a probe
would not need to know which one to watch.

Unknown sorts below a genuine zero. "We do not know" is not "nobody", and they
read identically to a person.

## Signed-in stays live, deliberately

`joinMetroWaitlistAction` still reads the live count after its write. There is
no oracle on that path — you are authenticated as yourself and cannot probe
someone else's address with it — and F076's own reasoning is that a member is
entitled to see themselves counted. The two paths now show figures that can
differ by up to an hour. That is a real inconsistency and it is the right trade;
recorded rather than smoothed over.

## What a cache does not close

After the window expires the figure refreshes. In a metro where nothing else
happened in that window, someone who submitted and waited could see it move by
one and attribute it to themselves. Inherent to any cache; no TTL removes it.
Weakest where demand is real, strongest in an empty metro — which is where the
answer is least interesting.

Said in the code, not only here, because the last version of this file asserted
a guarantee it did not have and that is what #196 cost.

## Three rulings, one unchanged schema

The migration header now records all three — no count, then the reversal — and
notes that **nothing in the SQL below changed for any of them**. The schema has
been correct throughout; only the comment kept being wrong.

The F076 amendment is routed to ops-pattern, not written from here.

## Also recorded

`AnnouncementFields.tsx` now carries a note that **F074 has no yearly case**.
Don named a yearly event on 2026-09-23 as the reason past announcements must
survive; the approved recurrence scenario is weekly-on-chosen-days. The note is
explicitly not a licence to build yearly off the back of it.

## Suite

2522 passed, zero failures.

One observation for #213: `migrations-pending-parse.test.ts` hit the new 60s
budget once during this work, and takes **29.8s alone** for four tests. The
project change fixed the class, but that file is genuinely slow rather than
merely tightly budgeted — worth a look on its own terms, not another timeout
bump.
