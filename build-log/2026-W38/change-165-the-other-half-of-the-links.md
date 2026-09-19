# The other half of the links

*2026-09-19. The registry declared six relationships. The app runs on twelve, and
#161 leaned on four of the six that were missing.*

## What was missing

| Link | `via` | What it carries that the column does not |
|---|---|---|
| an Announcement is posted to a Page | `page_posts.group_id` | one table and one composer for the dated post and the undated one — the ruling that means there is no `bulletins` table |
| an Announcement is at a Location | `page_posts.location_id` | a post never borrows its Page's pin |
| a Page is anchored at a Location | `groups.anchor_location_id` | no anchor → in no browse result at all, not ranked low |
| a Member follows a Member | `member_follows.followed_member_id` | a Page cannot be followed this way; that is a different link |
| a Page carries a Tag | `page_tags.tag_id` | the only vocabulary a creator authors; a hidden tag stops steering a lens |
| a Location is in a Place | `locations.place_id` | Places are curated, so nothing in the action layer writes this |

Each one had to bring that column to earn its entry. A link that only says what
the foreign key already says is the second description of the database this file
exists not to be.

## Two of them are declared broken, on purpose

**`page_posts.location_id` has no writer anywhere.** The column exists, T156
reads it and projects a post's own geography, and `group.post_create` inserts a
post without a location — there is no composer field for one. So every post in
production is addressless, and a read path built specifically to tell a post's
pin from its Page's has nothing yet to tell apart. `built: false`.

**`locations.place_id` has no action-layer writer either.** Two SQL functions
walk it — `place_url_path()` for a Page's URL, `zip_is_proximal_to_location()`
for the local-owner badge — and the only member-facing location insert omits it,
so those Locations carry a null `place_path` in browse. That is not a bug in the
registry; Places are platform-curated and nothing member-facing should write it.
Declaring it is how the gap stops being invisible.

Neither was findable before. The drift report is silent when clean by design,
and a column nothing writes produces no drift.

## Two names

`Post` left `ObjectTypeName`. `nouns.md` names the thing **Announcement** — "the
Page is the board, an announcement is the first kind of post" — and puts bare
*post* on its watch list because it means a `page_posts` row in one breath and
the act of posting in the next. `Place` was in the list relating nothing; the
Location→Place entry resolves it by use rather than by deletion.

The list is now a value, not a bare union, so a test can assert no name sits in
it unused — which is how both of those went stale — and so anything generating
from this file reads the list instead of re-parsing the source.

## The rule got a hook

"A link carries the ruling behind it or it does not go in" was a sentence in a
comment. Lesson 17: a rule with no hook is a wish. It is now four assertions over
the imported declarations — every link has a note, a note clears a length floor,
no two links share a name, every declared noun is related by something.

The floor caught two of the **original** six on the first run. *"Nullable: an
Item can exist before it has a Page to sit under"* and *"A join table, not a
column"* are both the column restated in English. Both were rewritten to say what
the placement means instead. A check written for new work finding old work is the
check doing its job.
