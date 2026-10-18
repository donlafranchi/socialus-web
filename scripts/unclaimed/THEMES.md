# Unclaimed Pages: who to look for each day

**As of 2026-10-16** · Source: hand-written · Maintained by: hand (set by tend-docs from the last commit date; the owner confirms on next edit)

The daily builder's guide to what to add: kinds of organization, the day's theme, the area, and the mix. Rules on sources, photos and links stay in #353, #517, #542 and #556. Don, 2026-10-13 (#786). `derives-from: PRINCIPLES.md#pitch @ 2026-10-15` (the pitch's capabilities `cap-1` … `cap-7`; socialus-plan `planning/research/pitch-audit-2026-10-15.md`).

## Pitch rules (#816)

Each rule serves a capability of the pitch; the check that holds it is named.

| Rule | Serves | Held by |
|---|---|---|
| **Dates** (Don, 2026-10-16): each Page's 3 samples fall on one weekday in weeks 1, 2 and 3 from now; every weekday has Pages, more on Fri–Sun; the kinds and hours vary, and a deal runs 2–3 days. Every Monday they roll forward. | `cap-1` timely announcements, `cap-5` current without following many | `sampleSchedule` (`src/lib/unclaimed/samples.ts`) and its tests; `unclaimed-roll.yml` rolls finished samples on and re-dates any off the pattern |
| **Interests:** every Page and its samples carry 1–2 of the 12 interest tags, from what the Page is. | `cap-3` the member's own signals, `cap-4` member control | `interestsFor` (`src/lib/unclaimed/plan.ts`); the loader adds missing tags on every run, so older Pages are backfilled |
| **Coverage:** each batch of 8 or more Pages spans at least 5 towns and at least 4 interest tags (a smaller batch loads what qualifies); `ADDED.md` logs each row's interests. | `cap-2` discovery without searching | `batchCoverage`; a test fails any such `makers-YYYY-MM-DD.json` from 2026-10-17 that misses it |

Not a rule yet: posting a business's real dated events from its own site instead of samples (a4). That is Don's call.

## Each run

1. **Take today's theme** from the rotation below (by weekday, Pacific time).
2. **Add 10 Pages:** 3–4 farms, ranches or animal farms, the rest from the day's theme. Use 4 farms only when the theme can't fill 7.
3. **Read `ADDED.md` first.** Skip any name or site already there. Don't add a kind of organization that is in the last 7 days, unless it's in today's theme. Skip a town that already has 3 or more Pages in the last 7 days.
4. **Spread the area and the interests** (batches of 8 or more): at least 5 different towns and at least 4 interest tags (Coverage, above), at most 2 Pages in the city of Sacramento, and over a week cover every direction (see Area).
5. **Coffee shops and roasters: at most 1 a week**, Mondays only, and none if `ADDED.md` has one in the last 7 days.
6. **Own site only** (#353): never Yelp, Google or another directory. A non-business with only a Facebook page is fine if that page is its own. **Etsy, Instagram and other marketplaces are for finding makers only** (Don, 2026-10-16): look a maker up there, then build the Page from the maker's own website, or skip them if they have none. Never copy text, photos or listings from the marketplace, and don't scrape it (look-ups by hand only). Credit and photos come from the maker's own site as usual. Note the lead source in `ADDED.md` (`lead: Etsy`).
7. **Social links, TikTok and Instagram first** (Don, 2026-10-16), then Facebook and the rest: take them from links on the business's own site, or from a search when the profile is clearly the same business. Put them in the row's `social` field; the loader also reads them off the site, and backfills older Pages that lack TikTok or Instagram. Link only: never copy their posts or photos into SocialUs. Owners use these to tell their own story.
8. **Look at every photo before loading** (`preview-photos.ts`). **No children in any photo** (F080). If a site's own photos show children, add the Page to `stockOnly` in `photo-overrides.json`. Pictures whose file names say an AI made them are skipped; when a site's real photos share a name pattern, `ownMatch` keeps to those.
9. **Write the rows** to `makers-YYYY-MM-DD.json`, dry-run the loader, then load (`unclaimed-load.yml`, write ticked). A site that opens by hand but fails from the runner at the network level (reset, refused, timed out) goes in `link-allow.json`; a 404 never does.
10. **Append the 10 to `ADDED.md`**, each with its interests (the tags the loader gives it; see Category).

## Rotation

| Day | Theme | Look for |
|---|---|---|
| Mon | Food makers | bakeries, specialty food makers, chocolatiers, breweries, cideries, wineries, olive oil and honey producers; **the week's one coffee shop, if any** |
| Tue | Volunteer and mutual aid | food banks and pantries, meal programs, Habitat for Humanity and ReStores, volunteer centers, mutual aid networks, community fridges, gleaning groups, tool libraries, repair cafés |
| Wed | Arts and culture | arts collectives, community theatres, galleries, choirs, community bands and orchestras, printmaking and pottery studios, makerspaces, historical societies, small museums |
| Thu | Clubs and service | Rotary, Lions, Kiwanis and other service clubs, garden clubs, quilting and craft guilds, astronomy, chess, birding and hiking clubs, adult sports leagues, running and cycling clubs |
| Fri | Green and outdoors | community gardens, land trusts, creek and river conservancies, trail groups, native plant societies, nurseries, farmers' markets |
| Sat | Shops and repair | bike shops, repair and trades, hardware, independent bookstores, record shops, nonprofit thrift stores, makers of goods |
| Sun | Neighbourhood life | Friends of the Library groups, neighbourhood associations, granges, community and senior centers, animal rescues and shelters, community programs |

**Next run, Sat 2026-10-17: Native creators and producers** (Don, 2026-10-16), in place of Shops and repair; after that, Native creators who meet the rule below join whichever day's theme they fit. Look for Native artists and makers, food producers, Native-led nonprofits, cultural centres and arts groups in the area.
- **Only when their own site says so:** it states they are Native or names a tribal affiliation. Never infer it from a name, a style or what they make. The Indian Arts and Crafts Act makes a false Native-made claim illegal, and honest origin is `cap-8`.
- **Describe them in their own words**, from their own site.

**Holidays, now through 2026-12-31:** 2–3 of each day's 10 are holiday-related: pumpkin patches, harvest and Christmas tree farms, holiday markets and craft fairs, gift makers, food for gatherings, and toy and food drives. A holiday farm still counts toward the 3–4 farms. Their sample posts carry holiday dates within their weekly dates (see Dates).

**Native plants and pollinators, recurring** (Don, 2026-10-18): native plant nurseries, seed sellers and seed libraries, vegetable and herb starts, garden centres, community seed swaps, CNPS and Master Gardener plant sales, arboretum nursery sales. It joins any day's theme; fall is the season (natives that need winter cold are sown now). **Native milkweed first** (narrowleaf *Asclepias fascicularis*, showy *A. speciosa*), as seed or plugs; confirm it from the seller's own site, and say what the site says. **Never promote tropical milkweed** (*A. curassavica*): it harms monarchs in California. A seller that carries it can still load, but no sample post features it. Use a category that doesn't say "garden" or "native plant" (those get the volunteer-style samples): `Nursery (natives and seeds)`, `Seed seller`. Sellers get the Farm pictures and the Farm sample voice, which never names a plant.

**Farms every day (3–4):** farms, orchards, ranches, animal farms, farm stands, u-pick, flower farms, agritourism.

**Not for now:** personal-care salons (#517). Organizations whose work centers on children (youth leagues, scouts, schools, PTAs), because their photos would show children (F080).

## Category to use in the row

The loader reads the `category` field. Use one of: `Farm`, `Ranch`, `Farm stay & agritourism`, `Food & drink`, `Cakes & bakery`, `Goods & crafts`, `Repair & trades`, `Art & print`, or for any non-business a plain name with the kind of group in it (`Food bank (nonprofit)`, `Service club`, `Community garden`, `Historical society`, `Animal rescue`, `Friends of the library`). Those get the community stock photos and volunteer-style sample posts and are listed to gather people, not to sell. Arts, music and history groups get the arts pictures; conservancies, land trusts, trail groups and gardens the outdoor ones; a nursery is a `Farm`. The category also sets the Page's interest tags (`interestsFor`).

## Area

**Anchor towns: Elk Grove, Davis, Lincoln, Auburn, El Dorado Hills, Sacramento, Folsom and Roseville** (Don, 2026-10-16, replacing the old Sacramento-only drive and #787). A town is in the area when it is **a 45–60 minute drive from any anchor** (OSRM or a maps check, no traffic; a foothill town that runs slow still counts). It loads when it is in `places`, which the Boundaries workflow fills for the counties below.

| Direction | Can load today |
|---|---|
| North | Rocklin, Lincoln, Sheridan, Loomis, Granite Bay, Citrus Heights, Orangevale, Knights Landing, Wheatland, Marysville, Olivehurst, Yuba City, Live Oak, Sutter, Arbuckle, Colusa |
| East | Roseville, Folsom, Auburn, Newcastle, Colfax, El Dorado Hills, Cameron Park, Shingle Springs, Placerville, Diamond Springs, Camino, Pollock Pines, Georgetown, Cool, Fair Oaks, Carmichael, Rancho Cordova, Grass Valley, Nevada City, Truckee, Plymouth, Amador City, Ione, Sutter Creek, Jackson |
| South | Elk Grove, Wilton, Herald, Galt, Courtland, Walnut Grove, Isleton, Lodi, Acampo, Lockeford, Stockton |
| West | West Sacramento, Davis, Woodland, Winters, Esparto, Capay, Guinda, Clarksburg, Dixon, Vacaville, Fairfield, Suisun City, Rio Vista, Vallejo, Benicia |

Counties loaded: El Dorado, Placer, Sacramento, Yolo, Sutter, Yuba, Solano, San Joaquin, Nevada, Amador, Colusa. Still out: Napa, Antioch and the Bay Area proper, Oroville, San Andreas, Penn Valley, Tracy and Manteca. Add a county with a line under `reach` in `scripts/boundaries/metros.ts` and run the Boundaries workflow.

**Local badge unchanged.** The new counties carry their own codes (Yuba City 49700, Vallejo 46700, Stockton 44700, Truckee–Grass Valley 45800, Amador 06005, Colusa 06011) and are not in `zip_metro_crosswalk`, so living there does not make a member local to Sacramento. Explore still scopes by the metro box (`metro_polygons`, south edge moved to 37.85 for Stockton); the three rings only drive signup and You so far.

**Loaded 2026-10-16 (first reach batch, 36 Pages):** Wheatland, Grass Valley, Nevada City, Truckee, Marysville, Colfax, Lodi, Stockton, Jackson, Plymouth, Dixon, Vacaville, Colusa, Benicia, Suisun City, Vallejo, Rio Vista. **Loaded 2026-10-16 (second batch, 10 Pages):** Yuba City, Live Oak, Fairfield, Williams, Acampo, Ione, Amador City. **Not yet reached (no own-site Page found):** Olivehurst, Arbuckle, Lockeford, Sutter Creek, Sutter; no Native-led maker with a site stating it was found in these towns, so look again.

**Spread over a week:** reach every direction, and at least 2 Pages a day from the new towns until each has one.
