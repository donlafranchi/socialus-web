# F074.1 · #592: the weekly series composer

The PM, 2026-10-11, option A: "Repeats weekly on" + weekday chips + "Starts" / "Ends (optional)", weekly only, as Google Calendar does it.

- `post_series` (weekdays as ISO 1–7, optional `starts_on` and `ends_on`) and `page_posts.series_id`; written only by `group.post_create` (RLS on, no policy). `series` on the input is strict: any other pattern or individual dates are refused.
- The post created with a series is its first occurrence: it needs a start time, must stand on a chosen weekday in the metro's zone, and inside the start and end dates. The composer works that date out (first chosen weekday on or after today and the start date), so the creator never enters an individual date.
- The composer shows the control only behind `NEXT_PUBLIC_SERIES_COMPOSER=1`. It stays off until the occurrence job lands (#593, #594, #595, timezone #597): until then a series would be its first post alone.

Derived copy for the PM: the time fields read "Starts at" / "Ends at" in repeat mode (so they are not mistaken for the start date), "Repeat weekly", "Doesn't repeat", "Pick at least one day.", "The first one has to fall on one of the days you picked."

Not here: expansion into rows, the rolling horizon, the metro timezone, de-duplication in the time read.
