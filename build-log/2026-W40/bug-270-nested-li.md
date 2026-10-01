### bug #270 — signed-in Explore failed to hydrate

Found by the #269 screenshot matrix on its first run, 2026-10-01. The "Announcements from Pages you follow" row wrapped each card in an `<li>`, and the card (`TileCard`, `WithheldAnnouncementCard`) is itself an `<li>`. React reported "<li> cannot be a descendant of <li>", and Explore's server HTML was thrown away and rebuilt in the browser for every signed-in visitor who follows a Page.

- `TileCard`, `WithheldAnnouncementCard` and `BrowseResultCard` take `as` ('li' by default, or 'div').
- `FollowingRow` passes `as="div"`, since it supplies the list item.

Test: `FollowingRow.test.tsx` "nests no list item inside another" was seen failing first. No migration.
