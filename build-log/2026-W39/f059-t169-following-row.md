# F059 · T169 · Browse carries announcements from Pages you follow

Issue #203. Criteria 2b and 2c — the last structural piece of F059, and after
the Bulletins cut the only payoff following a Page has.

## Built

`loadBrowse` makes a second `getBrowseFeed` call with
`audience: { audience: 'following', following }`. `BrowseSnapshot` gains
`following: BrowseResult[]`. `FollowingRow` renders it, or renders `null`.

The prior session's note in `load.ts` was right that nothing had to change
shape: the SQL already withheld, `resolveFollowedPageIds` already existed, and
what was missing was the caller.

## The two cases that look the same and are not

**Signed out** — the second call is never made and no follow set is resolved.
There is no member, so there is no set. Nothing reaches the browser to hide,
which is the strongest reading of criterion 2c.

**Signed in, following nothing** — the call IS made, with an empty array, and
`browse_feed`'s predicate matches nothing against it. **The withholding stays
in the query.** Short-circuiting here would move the rule into TypeScript where
the next person can change it without noticing. It costs one cheap RPC and buys
the property being structural rather than conditional. A test asserts the call
happens, which is an odd-looking test until you know why.

## Attachment, not authority

`resolveFollowedPageIds` reads `group_memberships.relationship`. It never reads
`role`. The probe below makes the split concrete: after `group.follow` the row
came back `relationship='follower'`, `role='steward'` — two different columns
answering two different questions, exactly as #172 ruled.

## Verified end to end, against Postgres, through the handlers

Not the seeds (`CLAUDE.md` § The seeds are privileged), and not mocks. A real
`auth.users` row, a real member, a real location anchored at the open metro's
centroid, two Pages created and activated and posted to through
`group.create` / `group.activate` / `group.post_create`, and the follow written
by `group.follow`:

```
PASS  empty follow set resolves to []
PASS  SQL returns nothing for an empty follow set (withholding is in the query)
PASS  follow set is exactly the followed Page
PASS  followed Page announcement is present
PASS  unfollowed Page is ABSENT from the personal half
PASS  written on relationship ('follower'), role is separate ('steward')
PASS  a left row drops out even though its role still says member
PASS  public half still carries both Pages
```

The prior session could not do this because Explore was still client-side. It
is server-rendered since #174, so there was no excuse left.

Probe rows removed afterwards; local `members`, `groups` and `locations` back
to zero probe rows.

## Copy

"Announcement" throughout. A test scans the rendered row for `post` and
`bulletin` and fails on either — that copy is exactly what a later edit smooths
over, and both words are decisions rather than preferences.

## Suite

2462 passed. One known flake — `manifest.test.ts` timing out at 6330ms against
a 5000ms limit, fourth occurrence today across four branches, all subprocess
spawns under parallel load. Already raised as its own chore. This branch
touches no migrations.
