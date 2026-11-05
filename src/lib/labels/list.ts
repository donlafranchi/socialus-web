// #1180 — the one shared list a post or Page is listed under (plan #273, Don ruled B, 2026-11-05).
//
// The 12 interest labels, each with finer ones beneath, and the plain words that point to each. A person keeps
// this list, never a model and never a member: posters pick from it, they don't add to it. A word is matched
// whole, case-insensitive, with a plural s/es allowed. The top labels are INTEREST_VOCAB's, in its order.

export interface FinerLabel {
  label: string
  words: readonly string[]
}

export interface TopLabel {
  /** The interest tag (member_interests) this label is. */
  tag: string
  label: string
  words: readonly string[]
  finer: readonly FinerLabel[]
}

export const LABELS: readonly TopLabel[] = [
  {
    tag: 'farmers-market',
    label: 'Farmers markets',
    words: ['farmers market', "farmer's market", 'farm stand', 'csa', 'farm'],
    finer: [
      { label: 'Produce', words: ['produce', 'vegetable', 'veggie', 'fruit', 'berry', 'berries', 'tomato', 'apple', 'peach', 'citrus'] },
      { label: 'Eggs & dairy', words: ['egg', 'dairy', 'milk', 'cheese', 'butter', 'yogurt'] },
      { label: 'Meat & fish', words: ['meat', 'beef', 'pork', 'chicken', 'lamb', 'fish', 'seafood', 'butcher'] },
      { label: 'Honey & preserves', words: ['honey', 'jam', 'preserves', 'pickle', 'salsa', 'olive oil'] },
      { label: 'Flowers', words: ['flower', 'bouquet', 'cut flowers', 'tulip', 'sunflower'] },
    ],
  },
  {
    tag: 'live-music',
    label: 'Live music',
    words: ['live music', 'music', 'musician', 'gig'],
    finer: [
      { label: 'Concerts', words: ['concert', 'headliner', 'tour'] },
      { label: 'Open mics', words: ['open mic', 'jam session', 'karaoke', 'songwriter'] },
      { label: 'Bands & DJs', words: ['band', 'dj', 'cover band', 'dance party'] },
      { label: 'Classical & choir', words: ['symphony', 'orchestra', 'choir', 'chamber music', 'opera', 'quartet'] },
      { label: 'Jazz & blues', words: ['jazz', 'blues', 'swing'] },
    ],
  },
  {
    tag: 'food-drink',
    label: 'Food & drink',
    words: ['food', 'drink', 'eat', 'menu', 'kitchen'],
    finer: [
      { label: 'Bakery', words: ['bakery', 'bread', 'sourdough', 'pastry', 'pastries', 'baked goods', 'cake', 'cookie', 'pie', 'croissant', 'bagel'] },
      { label: 'Coffee & tea', words: ['coffee', 'espresso', 'latte', 'tea', 'cafe', 'café'] },
      { label: 'Restaurants', words: ['restaurant', 'diner', 'bistro', 'dinner', 'brunch', 'lunch', 'pizza', 'tacos'] },
      { label: 'Food trucks', words: ['food truck', 'taco truck', 'pop-up kitchen'] },
      { label: 'Beer, wine & spirits', words: ['beer', 'brewery', 'taproom', 'wine', 'winery', 'cider', 'cocktail', 'distillery'] },
      { label: 'Sweets', words: ['chocolate', 'candy', 'ice cream', 'creamery', 'donut', 'gelato', 'sweets'] },
    ],
  },
  {
    tag: 'crafts',
    label: 'Crafts & makers',
    words: ['craft', 'handmade', 'handcrafted'],
    finer: [
      { label: 'Pottery', words: ['pottery', 'ceramic', 'ceramics', 'clay'] },
      { label: 'Jewelry', words: ['jewelry', 'earring', 'necklace', 'bracelet', 'bead'] },
      { label: 'Woodwork', words: ['woodwork', 'woodworking', 'carpentry', 'woodturning'] },
      { label: 'Textiles & knitting', words: ['knit', 'knitting', 'crochet', 'yarn', 'sewing', 'quilt', 'quilting', 'fabric', 'embroidery'] },
      { label: 'Candles & soap', words: ['candle', 'soap', 'bath bomb'] },
      { label: 'Craft fairs', words: ['craft fair', 'artisan market', 'holiday market', 'bazaar'] },
    ],
  },
  {
    tag: 'gardening',
    label: 'Gardening',
    words: ['garden', 'gardening', 'gardener'],
    finer: [
      { label: 'Plants & nurseries', words: ['plant', 'nursery', 'seedling', 'succulent', 'houseplant', 'native plants'] },
      { label: 'Community gardens', words: ['community garden', 'garden plot', 'plot'] },
      { label: 'Seed swaps', words: ['seed swap', 'seed', 'seed library'] },
      { label: 'Yards & landscaping', words: ['landscaping', 'yard work', 'lawn', 'mulch'] },
      { label: 'Trees & orchards', words: ['tree', 'orchard', 'pruning', 'arborist'] },
    ],
  },
  {
    tag: 'kids-family',
    label: 'Kids & family',
    words: ['kids', 'kid', 'children', 'child', 'family', 'families', 'all ages'],
    finer: [
      { label: 'Storytime', words: ['storytime', 'story time', 'read aloud'] },
      { label: 'Camps & classes for kids', words: ['kids class', 'summer camp', 'camp', 'after school'] },
      { label: 'Babies & toddlers', words: ['playgroup', 'playdate', 'toddler', 'baby', 'babies', 'stroller'] },
      { label: 'Family outings', words: ['family day', 'family fun', 'family friendly', 'pumpkin patch'] },
      { label: 'Childcare', words: ['childcare', 'babysitting', 'babysitter', 'daycare', 'nanny'] },
    ],
  },
  {
    tag: 'fitness',
    label: 'Fitness & outdoors',
    words: ['fitness', 'outdoors', 'outdoor', 'exercise'],
    finer: [
      { label: 'Running', words: ['run', 'running', 'runner', '5k', '10k', 'marathon', 'jog'] },
      { label: 'Cycling', words: ['bike', 'biking', 'cycling', 'bike ride'] },
      { label: 'Yoga & dance', words: ['yoga', 'pilates', 'dance class', 'dancing', 'zumba', 'tai chi'] },
      { label: 'Hiking & trails', words: ['hike', 'hiking', 'trail', 'nature walk', 'state park', 'regional park'] },
      { label: 'Paddling & swimming', words: ['kayak', 'paddle', 'paddleboard', 'swim', 'swimming', 'river', 'lake'] },
      { label: 'Gyms & workouts', words: ['gym', 'workout', 'bootcamp', 'crossfit', 'boxing', 'martial arts'] },
      { label: 'Team sports', words: ['soccer', 'softball', 'baseball', 'basketball', 'pickleball', 'tennis', 'volleyball', 'league'] },
    ],
  },
  {
    tag: 'arts',
    label: 'Arts & culture',
    words: ['art', 'arts', 'culture', 'cultural', 'artist'],
    finer: [
      { label: 'Galleries', words: ['gallery', 'exhibit', 'exhibition', 'art walk', 'second saturday', 'mural'] },
      { label: 'Theater & comedy', words: ['theater', 'theatre', 'improv', 'comedy', 'stand-up', 'musical'] },
      { label: 'Film', words: ['film', 'movie', 'screening', 'cinema'] },
      { label: 'Books & talks', words: ['book', 'author', 'book club', 'poetry', 'library', 'lecture', 'talk'] },
      { label: 'Museums & history', words: ['museum', 'history', 'historic', 'walking tour'] },
      { label: 'Art classes', words: ['painting', 'drawing', 'art class', 'printmaking', 'photography'] },
    ],
  },
  {
    tag: 'volunteering',
    label: 'Volunteering',
    words: ['volunteer', 'volunteering', 'give back'],
    finer: [
      { label: 'Cleanups', words: ['cleanup', 'clean-up', 'litter', 'trash pickup'] },
      { label: 'Food banks', words: ['food bank', 'food pantry', 'pantry', 'meal service', 'soup kitchen'] },
      { label: 'Animal rescue', words: ['animal rescue', 'rescue', 'shelter', 'adopt', 'adoption', 'foster'] },
      { label: 'Fundraisers', words: ['fundraiser', 'donate', 'donation', 'benefit', 'charity'] },
      { label: 'Tutoring & mentoring', words: ['tutor', 'tutoring', 'mentor', 'mentoring', 'literacy'] },
    ],
  },
  {
    tag: 'small-business',
    label: 'Local business',
    words: ['business', 'shop local', 'small business', 'locally owned'],
    finer: [
      { label: 'Shops & boutiques', words: ['shop', 'boutique', 'store', 'gift', 'gifts'] },
      { label: 'Home services', words: ['plumber', 'plumbing', 'electrician', 'handyman', 'house cleaning', 'repair', 'contractor', 'roofing'] },
      { label: 'Health & beauty', words: ['salon', 'barber', 'spa', 'massage', 'nails', 'skincare'] },
      { label: 'Pets', words: ['pet', 'dog', 'cat', 'grooming', 'vet', 'veterinarian'] },
      { label: 'Thrift & vintage', words: ['thrift', 'vintage', 'consignment', 'secondhand', 'antique'] },
    ],
  },
  {
    tag: 'sustainability',
    label: 'Sustainability',
    words: ['sustainability', 'sustainable', 'eco', 'zero waste', 'climate'],
    finer: [
      { label: 'Repair & reuse', words: ['repair cafe', 'fix-it', 'reuse', 'upcycle', 'upcycled'] },
      { label: 'Composting', words: ['compost', 'composting', 'worm bin'] },
      { label: 'Swaps', words: ['swap', 'clothing swap', 'free store', 'tool library'] },
      { label: 'Transit & carpools', words: ['transit', 'bus', 'carpool', 'light rail', 'ebike'] },
      { label: 'Clean energy', words: ['solar', 'clean energy', 'electric vehicle', 'heat pump'] },
    ],
  },
  {
    tag: 'neighborhood',
    label: 'Neighborhood life',
    words: ['neighborhood', 'neighbourhood', 'neighbor', 'neighbour', 'community', 'block'],
    finer: [
      { label: 'Meetups & socials', words: ['meetup', 'social', 'mixer', 'potluck', 'club', 'block party'] },
      { label: 'Lost & found', words: ['lost', 'found', 'missing', 'stray', 'lost dog', 'lost cat'] },
      { label: 'Yard sales', words: ['yard sale', 'garage sale', 'estate sale', 'moving sale', 'rummage sale'] },
      { label: 'Recommendations', words: ['recommend', 'recommendation', 'anyone know', 'looking for', 'can anyone suggest'] },
      { label: 'Neighborhood news', words: ['news', 'notice', 'announcement', 'road closure', 'new in town'] },
    ],
  },
]

/** Labels that sit beside any category rather than under one. "Free" is the free-things lens (2026-10-25: the
 *  lens is the tag lens pointed at that one word), so it stays a label a post can carry whatever it is. */
export const EXTRAS: readonly FinerLabel[] = [
  { label: 'Free', words: ['free', 'free admission', 'no cover', 'giveaway', 'curb alert', 'free to a good home'] },
]

/** Where a member's post lands when nothing in it matches (#1180). */
export const FALLBACK_LABEL = 'Neighborhood life'

/** The most a poster picks under Change, not counting an extra such as Free. */
export const MAX_PICKS = 3
