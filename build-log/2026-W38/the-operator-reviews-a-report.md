# The operator reviews a report on their phone — the launch blocker

*2026-09-17. F058 · T122 · #12. Single operator; delegation is a separate change.*

## Why this is the blocker

`[member-content-takedown]`: *"Nothing a member contributes — image, text, page,
listing — goes live in production until there is a report-and-takedown path for
that kind of content."* Reporting shipped in T159. This is the takedown half,
and without it member photos cannot reach production.

**What the absolute actually requires, versus what this builds.** It requires a
*path*: report, and takedown. It does not require a queue, a hide-before-review,
a restore, or presets. Those come from Don's 2026-09-13 decision, which put a
hide in front of the takedown and made the operator's job review rather than
deletion-on-sight. Worth recording, because it means the absolute clears with
less than the full ticket if that is ever needed.

## What shipped

**Two handlers**, `report.restore` and `report.remove`, registered in the action
layer. Authorization is in the handlers, not the UI — a non-operator calling
either, **including the Page's own owner**, gets an `AuthorizationError`.
Absence of a button is not authorization. First operator-privileged write in the
project; it sets the pattern.

**The outcomes are deliberately asymmetric.** Restore is reversible and clears
the hide, taking out the sticky lock against the current `photo_url` so the
restore → re-report → hidden-again loop stays closed. Remove is permanent and
nulls `photo_url`, so every read path loses it at once.

**`/admin/reports`** — server-rendered, `force-dynamic`, reads over
`DATABASE_URL` through the pool. `reports` has no client SELECT policy and did
not gain one. A non-operator gets **404, not 403**: a 403 tells a stranger there
is something here worth finding. Verified by hand — the route returns 404 signed
out with the variable unset.

**Operator identity** is `OPERATOR_MEMBER_ID`, one env var, documented in
`.env.local.example`. **Unset authorises nobody**, because the failure mode of
the alternative is the whole moderation surface open to the internet.
`ADMIN_EMAILS` is vendor-era residue and nothing reads it.

## The surface, phone-first

Each entry is **readable without the image**: what the reporter wrote, whose
Page, how long it has been hidden. The photo is blurred on load behind a
deliberate *Show photo* tap — two taps, never one. The operator is a person who
will do this many times, and the worst thing in the queue should not be the
first thing their eye lands on.

Ordered **oldest hidden first**, not oldest reported: a hidden photo is a
member's content withheld before anyone judged it, and that clock is the one
that matters.

**Friction on the destructive side only.** Restore is one tap. Remove asks once.
Adding a confirm to both would slow the queue to protect against half the risk,
and throughput is the point.

## Who the reviewer sees

Don's ruling, 2026-09-17: *"Anyone posting anything to the platform is subject
to review by the platform's staff."* The entry names the poster.

This **clarifies** the member-to-member rules rather than overriding them — and
the 2026-09-14 line already contemplated it in as many words: the 12-month
legal-name gate is *"a render gate, not a deletion... the platform keeps knowing
who someone is (the accountability floor, **and the operator's report-review
view depends on it**)"*.

**The boundary, written into the code** because this is the kind of line that
widens on its own: this authorises review *of reported content, by staff, for
moderation*. Not a licence to browse member data unrelated to a report. Every
column in the query is there because judging that report needs it — no bio, no
email, no location, no other Page.

**Checked, not assumed: there is no `members.legal_name` column.** The
2026-09-14 ruling describes signup collecting a legal name; the schema has
`display_name` and `handle`. So the reviewer sees those, which is all the
platform holds.

## The audit trail

Both handlers write a `group_events` row — `group.photo_restored` /
`group.photo_removed` — carrying the report id and `reviewed_by`. That is what
makes operator access accountable rather than merely permitted, and it matters
more the moment the operator is not only Don.

## Two gaps, both flagged rather than papered over

**The storage object is not deleted.** F058 criterion 4 asks for it. The bucket
policy is *"media authenticated delete own folder"* (migration 039) — a member
may delete their own folder and nobody else's, so the operator's key cannot
remove the object, and the service-role key is forbidden by the action-layer
conformance rules. Removal nulls `photo_url`, which takes the photo out of every
surface in the product; the residue is an orphaned object still reachable by
someone who already holds that exact URL. Closing it needs a storage policy for
the operator — a migration, which needs a production apply only Don runs.
Folding it in would have blocked this on him.

**Preset reject/approve reasons are not in this change.** `reports` has
`reviewed_at`, `reviewed_by_member_id` and `outcome`, and **no reason column** —
presets need a migration, which needs Don's production apply. Shipping them
together would have held the blocker behind him. The review ships; presets
follow immediately, with the draft list on the PR.

## Checks

`tsc` clean · build passes · conformance check clean · 59 tests — 16 on the
handlers (authorization first), 10 on the surface, 5 on the operator gate, 4 on
the queue ordering string, 4 on the route gate.
