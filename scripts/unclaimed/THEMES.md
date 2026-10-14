# Daily themes and coverage

For the daily unclaimed-Pages builder. Rules for sources, photos, samples and links stay in Issues #353, #517, #542, #556. Read `ADDED.md` first; append to it after every run.

## The day's 10

- **Theme day** = days since 2026-10-14, mod 8 (2026-10-14 is day 1). Today's file is `makers-YYYY-MM-DD.json` (rows as in `makers.json`; area as `Town (County)`).
- **3-4** Pages from the day's **lead** types.
- **3-4 farms, ranches or animal farms**, every day (category `Farm`, `Ranch` or `Farm stay & agritourism`). Not more.
- **The rest (2-4)** from the day's other types.
- **Coffee shops and roasters: at most 1 a week.** We have plenty.
- Non-business organizations are first-class: at least 4 of 10 a day should be volunteer, nonprofit or community groups (category `Nonprofit & volunteer`, which loads as a gathering place). Farms that are nonprofits count as farms.
- **Spread the towns:** no more than 3 of 10 in the city of Sacramento, and rotate through the outer towns below. Check `ADDED.md` for towns used lately.
- No personal-care salons. Own site only. Skip any name already in `ADDED.md` or `scripts/unclaimed/*.json`.

## The 8-day rotation

| Day | Theme | Lead types (3-4) | Also draw from |
|---|---|---|---|
| 1 | Volunteer and mutual aid | food banks and pantries, mutual aid groups, volunteer organizations, animal rescues and humane societies | community gardens, Habitat-style builders, free clinics, farm-to-school groups |
| 2 | Libraries, history, learning | Friends of the Library, historical societies, museums, science and nature centers | tutoring and literacy nonprofits, genealogy and astronomy clubs, school foundations, bookstores |
| 3 | Clubs and hobby groups | garden clubs, birding and naturalist groups, quilting and sewing circles, camera clubs | chess and game clubs, model railroad and car clubs, book clubs, ham radio, Master Gardeners |
| 4 | Sports and outdoors | youth and adult sports leagues, running and cycling clubs, rowing and paddling clubs | climbing gyms, hiking and trail groups, disc golf, skate and rec programs, outfitters |
| 5 | Arts and makers | arts collectives and guilds, community theaters, choirs and bands, makerspaces | galleries, pottery and woodworking studios, dance schools, murals and public-art groups |
| 6 | Service, faith, community | service clubs (Rotary, Lions, Kiwanis, Soroptimist), church community programs (meals, thrift, clothing closets), veterans groups, scouts and 4-H | senior centers, neighborhood associations, community foundations, cultural associations |
| 7 | Shops, trades, repair | bike shops, repair cafes and tool libraries, thrift and consignment, independent bookstores | hardware and sewing shops, leather and shoe repair, nurseries, print shops, record stores |
| 8 | Food, drink, markets | farmers markets and co-ops, bakeries and cake shops, breweries, wineries and cideries, food makers | food trucks, delis, ice cream, community kitchens. Coffee only if none in the last 7 days |

## Coverage: about 45-60 minutes' drive from Sacramento, every direction

Added to `places` in migration `20261014030000_metro_towns.sql` (approximate drive from downtown Sacramento). Davis, Folsom, Roseville and West Sacramento already existed.

| Direction | Towns |
|---|---|
| North | Yuba City (Sutter, ~45 min), Marysville and Wheatland (Yuba, ~45-50 min), Lincoln (Placer, ~35 min) |
| Northeast | Auburn (~35 min), Rocklin, Loomis, Granite Bay, Grass Valley and Nevada City (Nevada, ~60 min) |
| East | Placerville (~45 min), El Dorado Hills, Cameron Park |
| South | Galt (~30 min), Lodi (San Joaquin, ~40 min), Elk Grove |
| West | Woodland and Winters (Yolo, ~25-40 min), Davis, West Sacramento |
| Southwest | Dixon, Vacaville and Fairfield (Solano, ~35-50 min) |
| Inner ring | Rancho Cordova, Citrus Heights, Carmichael, Folsom |

Drive times are approximate; confirm in a map if a town is borderline. Not added: Stockton (the metro polygon's southern edge is at 38.0 N, so it sits just outside), Vallejo, Jackson, Truckee.

A business in a rural place not in `places` (Guinda, Capay, Camino) is filed under its county. Counties exist for Sacramento, Yolo, Placer, El Dorado, Sutter, Solano, San Joaquin, Yuba and Nevada.
