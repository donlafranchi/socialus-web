// #346 — the builder roster: invented Sacramento-region organizations the
// builder accounts create and keep active (Don, 2026-10-04: a wide variety,
// nothing run-of-the-mill). Every name, address and link is made up; links
// point at .example domains. Photos are Unsplash-licensed (photos.json).
// All of it is builder content, invisible to real members (#280), and removed
// before launch.

import photos from './photos.json'

/** The Page kinds Create offers, and the builder account that runs each. */
export type BuilderKind = 'business' | 'interest' | 'practice'
export const BUILDER_FOR: Record<BuilderKind, 'ownerBusiness' | 'ownerInterest' | 'ownerPractice'> = {
  business: 'ownerBusiness',
  interest: 'ownerInterest',
  practice: 'ownerPractice',
}

/** Areas the location picker knows without an address lookup. */
export type Area =
  | 'Oak Park' | 'Midtown' | 'Land Park' | 'Curtis Park' | 'East Sacramento'
  | 'West Sacramento' | 'Davis' | 'Roseville' | 'Folsom'

export interface Post {
  body: string
  /** An event: days from the run, 24h start, optional end. */
  when?: { inDays: number; start: string; end?: string }
}

export interface Org {
  key: keyof typeof photos
  kind: BuilderKind
  name: string
  area: Area
  description: string
  tags: string[]
  instagram?: string
  website?: string
  posts: Post[]
}

export const photoFor = (key: Org['key']) => photos[key]

export const ROSTER: Org[] = [
  // — farmers and ranchers —
  {
    key: 'grass-fed-cattle', kind: 'business', name: 'Cache Slough Grassland Beef', area: 'Davis',
    description: 'Angus-Hereford cross, grass-fed start to finish on irrigated delta pasture. We move the herd every three days and sell by the quarter, half or whole. Freezer space not included.',
    tags: ['beef', 'grassfed', 'ranch'], website: 'https://cacheslough-beef.example', instagram: 'cacheslough.beef',
    posts: [
      { body: 'Fall quarters are cut and wrapped. A quarter is about 110 lbs of mixed cuts and fits a 7 cu ft chest freezer, barely. Reply here or stop by Saturday.' },
      { body: 'Pasture walk: see the rotation, ask the hard questions about grass-finished, meet the herd from a respectful distance. Boots, not sandals.', when: { inDays: 9, start: '09:00', end: '11:00' } },
    ],
  },
  {
    key: 'pasture-chickens', kind: 'business', name: 'Bug Patrol Pastured Poultry', area: 'West Sacramento',
    description: 'Our hens live in mobile coops and spend their days scratching for crickets, grubs and whatever else the pasture offers. Eggs with dark orange yolks, and stewing birds in the fall.',
    tags: ['eggs', 'pastured', 'poultry'], instagram: 'bugpatrol.hens',
    posts: [
      { body: 'The coops moved to the north pasture this week and the hens found a grasshopper bonanza. Yolks are practically glowing. Two dozen per household until the pullets catch up.' },
      { body: 'Egg pickup at the farm stand, plus a coop tour for anyone who wants to see the hens at work.', when: { inDays: 3, start: '10:00', end: '12:00' } },
    ],
  },
  {
    key: 'beekeeper', kind: 'business', name: 'Slow Drift Apiary', area: 'Land Park',
    description: 'Forty hives spread across backyards and orchards between Land Park and the Pocket. Varietal honey when the bloom allows it: orange blossom, star thistle, and a dark fall buckwheat.',
    tags: ['honey', 'bees', 'pollinators'], website: 'https://slowdrift-apiary.example',
    posts: [
      { body: 'The star thistle honey is in. It’s light, floral and goes cloudy fast because it crystallises early. That’s a feature.' },
      { body: 'Open hive afternoon: suit up and look inside a working colony. Ten people, veils provided.', when: { inDays: 12, start: '15:00', end: '16:30' } },
    ],
  },
  {
    key: 'goat-dairy', kind: 'business', name: 'Two Fences Goat Dairy', area: 'Folsom',
    description: 'A small herd of Nubians and LaManchas on the edge of Folsom. Raw-milk chèvre for pet food only (we follow the rules), plus aged tommes and a feta that doesn’t apologise.',
    tags: ['cheese', 'goats', 'dairy'], instagram: 'twofences.goats',
    posts: [
      { body: 'Kidding season is over. Eleven kids, all bottle-friendly and very loud. The feta is back in stock now that the milk is flowing.' },
      { body: 'Cheese table at the farm gate: tasting flight of three, buy what you like.', when: { inDays: 5, start: '11:00', end: '14:00' } },
    ],
  },
  {
    key: 'heirloom-grain-mill', kind: 'business', name: 'Millrace Heirloom Grains', area: 'Davis',
    description: 'We stone-mill Sonora wheat, Red Fife and Abruzzi rye grown on three Yolo County farms. Flour milled weekly, never sitting in a warehouse.',
    tags: ['flour', 'grain', 'baking'], website: 'https://millrace-grains.example',
    posts: [
      { body: 'Fresh Sonora wheat flour, milled Tuesday. It drinks less water than commercial flour, so start at 70% hydration and adjust.' },
      { body: 'Mill day: watch the stones run and take home a bag still warm from the mill.', when: { inDays: 14, start: '09:30', end: '12:00' } },
    ],
  },
  {
    key: 'mushroom-forager', kind: 'business', name: 'Understory Mushroom Co.', area: 'East Sacramento',
    description: 'Chanterelles, hedgehogs and black trumpets from the foothills in season, and lion’s mane and oysters we grow ourselves the rest of the year.',
    tags: ['mushrooms', 'foraged', 'seasonal'], instagram: 'understory.mushrooms',
    posts: [
      { body: 'First rain, first flush. The oysters on the logs are going wild. Chanterelles are maybe three weeks out if the ground stays wet.' },
      { body: 'Mushroom table at the Sunday market. Lion’s mane, blue oysters and a few surprises.', when: { inDays: 4, start: '08:00', end: '12:00' } },
    ],
  },
  {
    key: 'olive-oil-press', kind: 'business', name: 'Dry Creek Olive Press', area: 'Roseville',
    description: 'Mission and Manzanillo trees older than the subdivision next door. We press within hours of picking and sell the oil green, peppery and unfiltered.',
    tags: ['oliveoil', 'orchard', 'pressing'], website: 'https://drycreek-press.example',
    posts: [
      { body: 'Picking starts in three weeks. Bring your own olives for a custom press, minimum 200 lbs, and go home with oil from your own trees.' },
      { body: 'Press day open house: taste the new oil off the decanter.', when: { inDays: 20, start: '10:00', end: '15:00' } },
    ],
  },
  {
    key: 'sheep-wool', kind: 'business', name: 'Tule Fog Fibre Flock', area: 'West Sacramento',
    description: 'Romney and Corriedale sheep, raised for fleece. Raw fleeces for spinners, washed locks, and yarn spun at a small mill up the road.',
    tags: ['wool', 'sheep', 'yarn'], instagram: 'tulefog.fibre',
    posts: [
      { body: 'Spring fleeces are skirted and sorted. The Corriedale grey is the softest we’ve had in years.' },
      { body: 'Shearing day: watch the shearer work and pick a fleece straight off the board.', when: { inDays: 18, start: '08:30', end: '13:00' } },
    ],
  },
  {
    key: 'native-plant-nursery', kind: 'business', name: 'Valley Oak Native Nursery', area: 'Curtis Park',
    description: 'California natives grown from local seed: milkweed for monarchs, deer grass, manzanita, and the oaks that used to line every creek here.',
    tags: ['natives', 'plants', 'habitat'], website: 'https://valleyoak-natives.example',
    posts: [
      { body: 'Fall is planting season. The narrowleaf milkweed is ready, and so are 40 baby valley oaks looking for room to grow.' },
      { body: 'Plant sale and a short talk on replacing a lawn with natives.', when: { inDays: 10, start: '09:00', end: '13:00' } },
    ],
  },
  {
    key: 'hmong-market-grower', kind: 'business', name: 'Yaj Family Greens', area: 'Oak Park',
    description: 'Three generations growing bitter melon, Thai chilies, lemongrass, pea shoots and long beans on five acres south of town. You’ll find us at the Sunday market.',
    tags: ['vegetables', 'market', 'farm'], instagram: 'yajfamily.greens',
    posts: [
      { body: 'Lemongrass is thick this year. We bundle it by the pound, and Grandma says freeze it whole, never chopped.' },
      { body: 'Sunday market stall: pea shoots, long beans and the last of the chilies.', when: { inDays: 6, start: '07:30', end: '12:00' } },
    ],
  },
  // — makers —
  {
    key: 'blacksmith', kind: 'business', name: 'Anvil & Ember Forge', area: 'West Sacramento',
    description: 'Hand-forged hooks, hinges, fire tools and the occasional gate. Commissions welcome if you can wait. Good iron takes time.',
    tags: ['forged', 'ironwork', 'handmade'], website: 'https://anvilember.example',
    posts: [
      { body: 'Finished a pair of garden gates for a Land Park client, with scrolls drawn from the original 1920s porch rail.' },
      { body: 'Open forge: watch a hook go from bar stock to finished in twenty minutes.', when: { inDays: 8, start: '17:00', end: '19:00' } },
    ],
  },
  {
    key: 'saddle-maker', kind: 'business', name: 'Cosumnes Saddlery', area: 'Folsom',
    description: 'Western saddles built on custom trees, tooled by hand, and repairs on anything with a horn. Tack restoration for heirloom pieces.',
    tags: ['leather', 'saddles', 'tack'], instagram: 'cosumnes.saddlery',
    posts: [
      { body: 'Restored a 1950s Hamley saddle this month. New sheepskin, new stirrup leathers, original tooling kept.' },
      { body: 'Leather care clinic: bring a saddle or bridle and learn to clean and oil it right.', when: { inDays: 15, start: '10:00', end: '12:00' } },
    ],
  },
  {
    key: 'letterpress', kind: 'business', name: 'Leading & Kerning Press', area: 'Midtown',
    description: 'A 1912 Chandler & Price, a wall of wood type, and a habit of printing wedding invitations so heavy the postage costs extra.',
    tags: ['letterpress', 'print', 'stationery'], website: 'https://leadingkerning.example',
    posts: [
      { body: 'New holiday cards are on the press: two colours, deep impression, cotton paper.' },
      { body: 'Print your own poster: set wood type and pull a proof.', when: { inDays: 11, start: '18:00', end: '20:00' } },
    ],
  },
  {
    key: 'luthier', kind: 'business', name: 'Spruce & Gut Lutherie', area: 'East Sacramento',
    description: 'Building and restoring violins, violas and the odd mandolin. Setups, bow rehairs and crack repairs for students and pros.',
    tags: ['violin', 'repair', 'instruments'],
    posts: [
      { body: 'Back-to-school setups are done. If your kid’s violin buzzes, bring it in. It’s usually the bridge, not the kid.' },
      { body: 'Workshop open house: see a violin in the white, before the varnish.', when: { inDays: 16, start: '13:00', end: '15:00' } },
    ],
  },
  {
    key: 'kayak-repair', kind: 'business', name: 'Sloughwater Boatworks', area: 'West Sacramento',
    description: 'Wooden boat building and repairs, from cracked kayak hulls to canoe ribs. If it floats, or used to, we can probably help.',
    tags: ['boats', 'repair', 'woodwork'], instagram: 'sloughwater.boats',
    posts: [
      { body: 'A 1960s cedar-strip canoe came in with a hole you could put a fist through. It’ll be on the water again by spring.' },
      { body: 'Boatshop open day: see projects mid-build.', when: { inDays: 19, start: '10:00', end: '13:00' } },
    ],
  },
  {
    key: 'vintage-motorcycle-restorers', kind: 'business', name: 'Points & Condenser Moto', area: 'Roseville',
    description: 'British and Japanese bikes from before 1980, restored, rewired and made to start on the first kick, most days.',
    tags: ['motorcycles', 'restoration', 'vintage'], website: 'https://points-condenser.example',
    posts: [
      { body: 'A 1972 Honda CB350 just rolled out after a full rebuild. Original paint, new everything else.' },
      { body: 'Garage night: bring your project and your questions.', when: { inDays: 7, start: '18:30', end: '21:00' } },
    ],
  },
  // — unusual services —
  {
    key: 'farrier', kind: 'business', name: 'Hoofline Farrier Service', area: 'Folsom',
    description: 'Trims, hot shoeing and corrective work for pleasure horses, ranch horses and the occasional mule. I come to you.',
    tags: ['farrier', 'horses', 'mobile'],
    posts: [
      { body: 'Booking October rounds for the Folsom and El Dorado Hills barns now. Six-week cycle, same day each round.' },
      { body: 'Barn day at Willow Creek Stables: trims all morning. Message to get on the list.', when: { inDays: 13, start: '08:00', end: '13:00' } },
    ],
  },
  {
    key: 'knife-sharpener', kind: 'business', name: 'Whetstone Wagon', area: 'Midtown',
    description: 'A mobile sharpening cart with water stones, not a grinder. Kitchen knives, scissors, garden shears and the axe your grandfather left you.',
    tags: ['sharpening', 'knives', 'mobile'], instagram: 'whetstone.wagon',
    posts: [
      { body: 'Restaurant route is full for October. The cart is on the street Saturdays for everyone else.' },
      { body: 'Sharpening at the corner of 20th and J: drop off, grab a coffee, pick up.', when: { inDays: 2, start: '09:00', end: '13:00' } },
    ],
  },
  {
    key: 'tree-surgeon', kind: 'business', name: 'Canopy Care Arborists', area: 'Land Park',
    description: 'Certified arborists who climb rather than cut down. Structural pruning, cabling for old oaks, and honest advice about when a tree has to go.',
    tags: ['trees', 'arborist', 'pruning'], website: 'https://canopycare.example',
    posts: [
      { body: 'Winter pruning slots for elms and sycamores open in November. Book early, the good weather fills fast.' },
      { body: 'Free tree walk in William Land Park: what to look for before you call anyone.', when: { inDays: 17, start: '10:00', end: '11:30' } },
    ],
  },
  {
    key: 'bike-courier', kind: 'business', name: 'Grid Runner Courier', area: 'Midtown',
    description: 'Same-hour delivery by bicycle anywhere in the grid. Legal documents, cake, lab samples, house keys. Rain or shine, mostly shine.',
    tags: ['courier', 'bicycle', 'delivery'], instagram: 'gridrunner.courier',
    posts: [
      { body: 'Added a cargo bike: up to 80 lbs now, so yes, we can move your sourdough starter collection.' },
      { body: 'Alleycat ride for charity, a checkpoint race through Midtown.', when: { inDays: 21, start: '18:00', end: '21:00' } },
    ],
  },
  {
    key: 'mobile-sauna', kind: 'business', name: 'Steam Trailer Sauna', area: 'Davis',
    description: 'A wood-fired sauna on a trailer. We park it by a river, a farm or your backyard, and you bring a towel and a cold plunge plan.',
    tags: ['sauna', 'wellness', 'mobile'], website: 'https://steamtrailer.example',
    posts: [
      { body: 'Fall season starts: weekend sessions on the Putah Creek bank, cold plunge in the creek itself.' },
      { body: 'Community sauna evening, 90 minutes of heat and cold.', when: { inDays: 5, start: '17:30', end: '19:00' } },
    ],
  },
  // — local food —
  {
    key: 'smokehouse', kind: 'business', name: 'Oak Smoke Provisions', area: 'Oak Park',
    description: 'Brisket smoked over almond and oak for fourteen hours, house sausages, and a Saturday line that moves faster than you’d think.',
    tags: ['barbecue', 'smoked', 'brisket'], instagram: 'oaksmoke.provisions',
    posts: [
      { body: 'New this week: smoked beef cheeks, only a dozen trays a day. When they’re gone, they’re gone.' },
      { body: 'Saturday pit day: brisket out at 11 and we sell until it runs out.', when: { inDays: 2, start: '11:00', end: '15:00' } },
    ],
  },
  {
    key: 'tamale-cart', kind: 'business', name: 'Tamales Doña Lupe', area: 'Oak Park',
    description: 'Red pork, green chicken, rajas con queso and sweet pineapple, steamed in the morning and sold from the cart until they’re gone.',
    tags: ['tamales', 'streetfood', 'mexican'],
    posts: [
      { body: 'Holiday orders open: by the dozen, ready the week before Christmas. Masa is ground fresh, not from a bag.' },
      { body: 'The cart at Broadway and 35th, every morning this week.', when: { inDays: 1, start: '07:00', end: '11:00' } },
    ],
  },
  {
    key: 'cider-press', kind: 'practice', name: 'Windfall Cider Pressing Days', area: 'East Sacramento',
    description: 'Bring apples from your backyard tree and learn to press, ferment and bottle your own cider on our shared hand press.',
    tags: ['cider', 'apples', 'pressing'],
    posts: [
      { body: 'Last year we pressed 2,000 lbs of backyard apples that would otherwise have rotted on the lawn. Let’s beat that.' },
      { body: 'Pressing day: bring apples and clean jugs, and leave with juice and a fermentation plan.', when: { inDays: 9, start: '10:00', end: '14:00' } },
    ],
  },
  // — classes and practices —
  {
    key: 'foraging-walks', kind: 'practice', name: 'Wild Edges Foraging Walks', area: 'Folsom',
    description: 'Slow walks along the American River Parkway learning to identify what’s edible, what’s medicinal and what will ruin your weekend.',
    tags: ['foraging', 'plants', 'walks'], instagram: 'wildedges.walks',
    posts: [
      { body: 'Elderberries are done; acorns are up next. Next walk covers leaching and why the valley oak matters.' },
      { body: 'Fall foraging walk from the Negro Bar trailhead: two hours, slow pace.', when: { inDays: 6, start: '09:00', end: '11:00' } },
    ],
  },
  {
    key: 'rope-making', kind: 'practice', name: 'Twist & Lay Ropewalk', area: 'Davis',
    description: 'Learn to make rope the old way, from tule, hemp and cotton, on a hand-cranked ropewalk. Kids welcome with a grown-up.',
    tags: ['rope', 'crafts', 'workshop'],
    posts: [
      { body: 'We gathered tule from the bypass this week, the same plant the Patwin used for boats and baskets.' },
      { body: 'Ropewalk workshop: everyone leaves with a length of rope they twisted themselves.', when: { inDays: 12, start: '13:00', end: '15:30' } },
    ],
  },
  {
    key: 'community-darkroom', kind: 'practice', name: 'Silver Halide Darkroom', area: 'Midtown',
    description: 'A shared black-and-white darkroom with enlargers, chemistry and patient people. Intro classes monthly, and open hours for members.',
    tags: ['film', 'darkroom', 'photography'], website: 'https://silverhalide.example',
    posts: [
      { body: 'The second enlarger is fixed, so open hours can take two printers at once now.' },
      { body: 'Intro to film developing: load a reel in the dark and see your first negatives.', when: { inDays: 8, start: '18:00', end: '20:30' } },
    ],
  },
  // — groups —
  {
    key: 'river-float-club', kind: 'interest', name: 'American River Float Club', area: 'Folsom',
    description: 'Inner tubes, sunscreen and a slow drift from Sunrise to Goethe. We float weekends through October and carpool back to the cars.',
    tags: ['river', 'floating', 'summer'], instagram: 'arfloatclub',
    posts: [
      { body: 'Water’s still warm. Last two floats of the season, so bring a dry bag and a friend.' },
      { body: 'Float from Sunrise put-in, meeting in the parking lot.', when: { inDays: 3, start: '11:00', end: '15:00' } },
    ],
  },
  {
    key: 'astronomy-meetup', kind: 'interest', name: 'Delta Dark Sky Stargazers', area: 'Davis',
    description: 'Telescopes in a dark field west of Davis once a month, close to the new moon. No experience needed, red flashlights only.',
    tags: ['astronomy', 'stargazing', 'telescopes'],
    posts: [
      { body: 'Saturn’s rings are tilted just right this month. If you’ve never seen them in a telescope, this is the one to come to.' },
      { body: 'New moon star party, past the county road gate.', when: { inDays: 10, start: '19:30', end: '23:00' } },
    ],
  },
  {
    key: 'seed-swap', kind: 'interest', name: 'Sacramento Seed Swap Circle', area: 'Curtis Park',
    description: 'Bring seeds you saved, take seeds you need. Heirloom tomatoes, Armenian cucumbers, Hopi blue corn and a lot of zinnias.',
    tags: ['seeds', 'gardening', 'swap'],
    posts: [
      { body: 'We’re labelling envelopes for the winter swap. If you saved fava or snap pea seeds, bring them.' },
      { body: 'Winter seed swap at the Curtis Park community room, with tables and coffee.', when: { inDays: 14, start: '10:00', end: '12:00' } },
    ],
  },
  {
    key: 'adult-swim-league', kind: 'interest', name: 'Late Lane Masters Swim', area: 'Land Park',
    description: 'Adults who swim laps together after work. All speeds, coached sets, and a lane for people who just learned last year.',
    tags: ['swimming', 'fitness', 'pool'],
    posts: [
      { body: 'New beginner lane on Thursdays. If you can swim a length without stopping, you’re in.' },
      { body: 'Evening coached workout: 45 minutes, with lanes by pace.', when: { inDays: 4, start: '18:30', end: '19:30' } },
    ],
  },
  {
    key: 'bird-count', kind: 'interest', name: 'Yolo Bypass Bird Count', area: 'West Sacramento',
    description: 'Counting sandhill cranes, white-faced ibis and everything else in the bypass, for the fun of it and for the data. Binoculars to lend.',
    tags: ['birds', 'birdwatching', 'nature'], website: 'https://bypass-birdcount.example',
    posts: [
      { body: 'The cranes are back. Last week we counted 412 in one field.' },
      { body: 'Morning count along the bypass auto tour route: carpool from the levee lot.', when: { inDays: 7, start: '07:00', end: '10:00' } },
    ],
  },
  {
    key: 'repair-cafe', kind: 'interest', name: 'Fix-It Saturday Repair Café', area: 'Oak Park',
    description: 'Volunteers with soldering irons, sewing machines and patience. Bring a toaster, a torn jacket or a wobbly chair and we fix it together.',
    tags: ['repair', 'volunteers', 'reuse'],
    posts: [
      { body: 'Last month: 31 items in, 24 fixed. The lamp from 1962 now works better than it did in 1962.' },
      { body: 'Repair café at the Oak Park library community room.', when: { inDays: 11, start: '10:00', end: '13:00' } },
    ],
  },
  {
    key: 'bread-oven-collective', kind: 'interest', name: 'Communal Hearth Bread Oven', area: 'Curtis Park',
    description: 'A wood-fired oven built by neighbours in a shared lot. Fire it Saturday mornings and bring your dough. First-timers get a loaf to take home.',
    tags: ['bread', 'woodfired', 'neighbours'],
    posts: [
      { body: 'New door on the oven: it holds heat for two more bakes now. Thank you to everyone who mixed mortar.' },
      { body: 'Bake day: fire goes on at 6, first loaves in at 8.', when: { inDays: 2, start: '08:00', end: '12:00' } },
    ],
  },
  {
    key: 'falconry-club', kind: 'interest', name: 'Valley Falconry Club', area: 'Roseville',
    description: 'Licensed falconers and the curious. Monthly flying meets with red-tails and kestrels, and mentoring for apprentices.',
    tags: ['falconry', 'raptors', 'birds'],
    posts: [
      { body: 'An apprentice flew her first red-tail free last week. Very proud.' },
      { body: 'Flying meet at the open field off Pleasant Grove: watch, ask, no touching the birds.', when: { inDays: 15, start: '08:00', end: '10:30' } },
    ],
  },
  {
    key: 'sourdough-starter-library', kind: 'interest', name: 'Starter Library Sacramento', area: 'East Sacramento',
    description: 'Borrow a sourdough starter with a story: a 1906 San Francisco culture, a rye starter from Finland, one from somebody’s grandmother in Modesto.',
    tags: ['sourdough', 'baking', 'sharing'],
    posts: [
      { body: 'Three new starters donated this month, including a whole-wheat one that’s been fed daily since 1987.' },
      { body: 'Starter swap and feeding clinic: bring a jar.', when: { inDays: 13, start: '10:00', end: '11:30' } },
    ],
  },
]

/** Today's new organizations: the next few not yet created, in roster order. */
export function todaysNew(existing: Set<string>, perKind = 2): Org[] {
  const out: Org[] = []
  for (const kind of Object.keys(BUILDER_FOR) as BuilderKind[]) {
    out.push(...ROSTER.filter((o) => o.kind === kind && !existing.has(o.name)).slice(0, perKind))
  }
  return out
}

/** A post for an organization on a given day, rotating through its posts. */
export function postFor(org: Org, day: number): Post {
  return org.posts[day % org.posts.length]!
}
