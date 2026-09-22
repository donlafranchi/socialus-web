# chore · robots.txt answers the training crawlers, and names them

Issue #199. The politeness layer of the AI-crawler work.

## Built

`src/app/robots.ts` — a typed route rather than a static file, so the crawler
list is testable and a rename upstream fails a test instead of failing silently.

Two groups: `*` allowed with the account, operator and API routes disallowed;
then one group naming 24 training and answer-engine agents, disallowed
everything.

Search engines are deliberately **not** on the list. `Google-Extended` and
`Applebot-Extended` exist precisely so the training agent can be refused while
the search crawler indexes — being absent from search is not a privacy win, and
*who exists* is meant to be findable.

Not `llms.txt`. Crawlers do not fetch it.

## Tests

Twelve, and the list is what they are about: that it is non-empty and has no
duplicates, that every name on it is disallowed `/`, that none has an `allow`
carve-out, that the five that matter today are present by name, that the
private paths are closed to everyone, and that the public surfaces are not.

## What it does not do

Stops nobody who ignores it — that is #201, the firewall.

**Does not cover the data at all.** PostgREST serves the same rows on a
`*.supabase.co` origin with a key that ships in our own bundle (#178). This
file is scoped to `www.socialus.org`. A crawler that reads the bundle has a
second door, and neither this nor the firewall is in front of it. That is #200,
which also found that the line *who exists is public, what's happening is not*
contradicts the 2026-09-18 signed-out-Explore decision — announcements with
times and places are anonymous-readable today, in the feed and through REST.

The header comment in `robots.ts` says all of this, because a file like this
invites being read as the job being done.
