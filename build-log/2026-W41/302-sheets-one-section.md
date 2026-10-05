# change #302 — each Add opens only its own fields

Don, 2026-10-05: on the draft Page every Add opened the same long form. Each now opens a sheet with only that section's fields, saving in place: Name and Description are separate sheets; Where asks #348's one question (three answers, pins and town pickers) instead of the old address form; Links shows only the Page's links and an "Add a link" picker. One primary button per sheet (Save); the header's close is the way out, warning first if something changed. Path: well-worn (Google Business Profile's edit-by-section, Airbnb's listing editor).

The where-to-save logic moved to `src/components/locations/where-save.ts`, shared by the Edit form and the sheet. Eight new tests, seen failing against the old sheets.
