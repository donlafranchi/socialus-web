# change: the Explore cards show no hashtags

Don, 2026-10-12, matching #619 and #621 (plain words, no hashtags). `BrowseResultCard`, the one card for Pages and Posts on Explore, no longer renders `TagChips`. Tags stay on the data, on the Page itself, in the filter sheet and in the tag input; nothing is deleted. The test that asserted chips is replaced by one that asserts none.

Explore is not renamed here; that waits on Don.
