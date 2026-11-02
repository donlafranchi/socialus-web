// Product flags: a feature that's built but held back, data kept.

/** Don, 2026-10-05: hours are hidden for now; they clutter the Page. The column
 *  and the data stay; turn this on to show and edit them again. */
export const SHOW_OPENING_HOURS = false

/** Don, 2026-10-27 (web #1093): Open your town waits until after soft launch. Off: /open, /open/<town>,
 *  the signup redirect and the daily town round are inert; code and migrations stay. */
export const OPEN_YOUR_TOWN = false

/** #1171 (plan #269, Don 2026-11-02): "I didn't decide no public counts. That one is open for review." Hearts ship
 *  without a public count; a Page's managers see who. On: everyone who can see a post sees its heart count. */
export const PUBLIC_HEART_COUNT = false
