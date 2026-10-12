# F103.1 · #693: a market is a row

New tables `markets` and `market_members`, and `market_key(county, subdivision)`. Sacramento (Sacramento, Yolo, Placer, El Dorado whole; state carried over from the metro) is open; the Tahoe basin (Placer's Lake Tahoe CCD, El Dorado's South Lake Tahoe CCD, checked against the Census 2023 Gazetteer) is carved out as a waiting market. Any other county is `county-<fips>` by rule, with no rows. Moving a member is one `market_members` row.

Data only: nothing reads the tables yet; #694 reads `market_key` at signup. The feed still reads `metro_polygons`.

Not here: county names and the zip → county table (#694); `home_market_id` (#695).
