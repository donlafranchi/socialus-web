# Unclaimed Pages: who to look for each day

The daily builder's guide to what to add: kinds of organization, the day's theme, the area, and the mix. Rules on sources, photos and links stay in #353, #517, #542 and #556. Don, 2026-10-13 (#786).

## Each run

1. **Take today's theme** from the rotation below (by weekday, Pacific time).
2. **Add 10 Pages:** 3–4 farms, ranches or animal farms, the rest from the day's theme. Use 4 farms only when the theme can't fill 7.
3. **Read `ADDED.md` first.** Skip any name or site already there. Don't add a kind of organization that is in the last 7 days, unless it's in today's theme. Skip a town that already has 3 or more Pages in the last 7 days.
4. **Spread the area:** at least 5 different towns, at most 2 Pages in the city of Sacramento, and over a week cover every direction (see Area).
5. **Coffee shops and roasters: at most 1 a week**, Mondays only, and none if `ADDED.md` has one in the last 7 days.
6. **Own site only** (#353): never Yelp, Google or another directory. A non-business with only a Facebook page is fine if that page is its own.
7. **Look at every photo before loading** (`preview-photos.ts`). **No children in any photo** (F080). If a site's own photos show children, add the Page to `stockOnly` in `photo-overrides.json`.
8. **Write the rows** to `makers-YYYY-MM-DD.json`, dry-run the loader, then load (`unclaimed-load.yml`, write ticked).
9. **Append the 10 to `ADDED.md`.**

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

**Farms every day (3–4):** farms, orchards, ranches, animal farms, farm stands, u-pick, flower farms, agritourism.

**Not for now:** personal-care salons (#517). Organizations whose work centers on children (youth leagues, scouts, schools, PTAs), because their photos would show children (F080).

## Category to use in the row

The loader reads the `category` field. Use one of: `Farm`, `Ranch`, `Farm stay & agritourism`, `Food & drink`, `Cakes & bakery`, `Goods & crafts`, `Repair & trades`, `Art & print`, or for any non-business a plain name with the kind of group in it (`Food bank (nonprofit)`, `Service club`, `Community garden`, `Historical society`, `Animal rescue`, `Friends of the library`). Those get the community stock photos and volunteer-style sample posts and are listed to gather people, not to sell.

## Area

**Towns within about a 45–60 minute drive of Sacramento** (OSRM driving time from downtown, no traffic, checked 2026-10-13). A town loads only if it is in `places` (or its county is, with a boundary) and inside the Explore metro.

| Direction | Can load today | Not yet loadable |
|---|---|---|
| North | Rocklin, Lincoln, Sheridan, Loomis, Granite Bay, Citrus Heights, Orangevale, Knights Landing | Yuba City, Live Oak, Sutter, Marysville, Olivehurst, Wheatland, Arbuckle |
| East | Roseville, Folsom, Auburn, Newcastle, Colfax, El Dorado Hills, Cameron Park, Shingle Springs, Placerville, Diamond Springs, Camino, Pollock Pines, Georgetown, Cool (county), Fair Oaks, Carmichael, Rancho Cordova | Grass Valley, Nevada City; Plymouth, Amador City, Ione, Sutter Creek, Jackson |
| South | Elk Grove, Wilton, Herald, Galt, Courtland, Walnut Grove, Isleton | Lodi, Acampo, Lockeford, Stockton |
| West | West Sacramento, Davis, Woodland, Winters, Esparto, Capay (county), Guinda, Clarksburg | Dixon, Vacaville, Fairfield, Suisun City, Rio Vista |

Left out: Napa, Vallejo, Benicia, Antioch (Bay Area markets, 70–80 min), Oroville, Colusa, San Andreas, Penn Valley (over 80 min). Grass Valley, Nevada City and Jackson come in at 73–79 min on OSRM, which runs slow on foothill roads; they count as in the area.

**Why some can't load yet:** their counties (Sutter has no boundary yet; Yuba, Nevada, Solano, San Joaquin, Amador, Colusa aren't in `places`) aren't loaded, and Stockton is also just outside the Explore metro's box. Adding those counties changes which ZIPs count as local to Sacramento, so it waits on a decision (#787). Until then, don't add Pages in those towns.
