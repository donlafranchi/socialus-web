### Page-editing batch, 10-06 night (#458 #452 #453 #456 #455 #454 #462 #465 #450 #440 #439 #341 #339 #338 #108)

- **Public Page (#458):** a header block (cover, name, kind, Share, Follow or the owner bar), then contained, titled sections: About (long text collapsed behind More), Location (place, how to find it, a static Mapbox map at the pin; signed in only), Contact, Tags & links, Posts, Products & services. `PageSection`, `AboutText`, `PageMap`.
- **Posts (#462):** the latest three as cards in a row that scrolls inside the section, newest left; See all posts opens the full list, newest first. A link to an older post opens the list so it lands. Heading is Posts (noun ruling 2026-10-05).
- **Owner (#456, #453):** Announce is the owner's one primary; Edit is a 44px pencil (`PencilButton`, aria-label "Edit Page"). Each Edit card has one pencil in its header ("Edit <section>").
- **Edit page (#452, #465, #108):** Basics (photo, name, description), Location, Contact, Tags & links (with the link that can't move), Values & badges · Coming soon, then Page settings (what it's for, what it shows, Archive, Delete). No collapsible groups. The description counts down in its last 200 characters.
- **Location (#440, #455):** a neighbourhood picked by name turns on "Show only my neighbourhood" and keeps that neighbourhood; the sheet opens on the saved pin (`savedPin`, kept out of the value so an unmoved pin saves only the note).
- **Your Pages (#454):** live, then drafts, archived, deleted, each by name.
- **Email addresses (#450):** Page and post text refuses an address on save (`src/lib/text/contact-info.ts`); stored ones are masked where cards, the Page and posts are read.
- **Archived read paths (#439, migration 20261007100000):** `discoverable_items`, `venue_hosted_items` and `group_url_prefixes` drop archived and deleted Pages; a trigger refreshes the view on a lifecycle change.
- **Small bugs:** a member of an open Page sees Member, not a Following toggle (#338); no "a location" line (#339); no Products card on a private Page (#341).
