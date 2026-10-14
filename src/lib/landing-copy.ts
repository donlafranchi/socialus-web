// /landing — a preview of the new front door (Don, 2026-10-08). Not linked
// from anywhere and noindex until he rules on it. Copy follows
// socialus-plan product/foundation/voice-and-tone.md. The headline is the
// tagline (copy report §1, draft): it needs a dated DECISIONS.md line before
// this goes public, since it differs from the locked name line.

export const LANDING = {
  headline: 'SocialUs: the people’s platform.',
  subhead: 'Find the local, the quirky, the one of a kind, and the people behind it.',
  verbs: [
    'Find what’s good where you live, and get found.',
    'Start something new for people who love what you love.',
    'Help build what comes next. It’s built to serve its members.',
  ],
  ctas: { primary: 'Get on the list', secondary: 'About SocialUs' },
  rotating: {
    prefix: 'Find people who love',
    items: [
      'fixing bikes and open mics',
      'petting farms',
      'bluegrass and stained glass',
      'paddle ponds',
      'potlucks and food trucks',
      'a lake with a swim-up bar',
      'home brews and canoes',
      'u-pick orchards',
      'poetry and pottery',
      'drive-in movies',
      'trail runs and cinnamon buns',
      'roller rinks',
      'dominoes and old radios',
      'corn mazes',
      'bonsai and chai',
      'pinball',
      'drag shows and rodeos',
      'the river',
    ],
  },
  find: {
    title: 'Looking for something?',
    body: [
      'Here, you find the people behind things. The bakery that sells out by ten. The Thursday run that leaves from the park. The person who fixes old radios out of a garage.',
      'Search for what you’re into and see who’s already doing it. Follow a Page and its updates come to you, in the app, so nobody needs your email.',
    ],
  },
  beFound: {
    title: 'Want to be found?',
    body: [
      'If you run a shop, make something, lead a group, or put on events, make a Page. Say who you are, what you’re about, and where you’ll be.',
      'People searching for what you do find you by what you do, not by what you paid. We currently don’t sell placement.',
    ],
  },
  offline: {
    title: 'Online, then off',
    body: 'The internet is good for one thing here: helping people find each other. Everything after that happens in person. Find your people on the screen, then put it down and go meet them.',
  },
  members: {
    body: 'Other apps call you users. We call you members, because it’s built to serve the people in it. Members first, always.',
    link: 'About SocialUs',
  },
  waitlist: {
    title: 'Get on the list',
    email: 'Email',
    zip: 'Zip code',
    runs: 'I run a business or group',
    help: 'I’d help build this',
    submit: 'Put me on the list',
    busy: 'Just a moment…',
    note: 'We’re opening one community at a time. We’ll let you know when yours is ready. We currently use your email for that and nothing else.',
    done: {
      waiting: 'You’re on the list. You’ll hear from us when your area opens.',
      open: 'Your area is open. Sign up and have a look.',
      outside: 'We’re not in your area yet. We’re opening one community at a time.',
    },
    errors: {
      email: 'That doesn’t look like an email address.',
      zip: 'Enter a 5-digit zip code.',
      failed: 'That didn’t go through. Mind trying again?',
    },
  },
  footer: { signoff: 'See you out there.' },
} as const

export const ABOUT = {
  title: 'About SocialUs',
  sections: [
    {
      id: 'mission',
      title: 'What this is for',
      body: [
        'SocialUs connects people in real life. That’s the whole job. Find what’s good where you live, find the people behind it, and go meet them.',
        'Small shops, people who make things, and groups that meet on Tuesdays are what hold a place together. On their own, each one is easy to miss. Once they find each other, they add up to something the big outfits can’t match. This is a place for them to find each other.',
        'SocialUs is never extractive. We currently don’t sell your data or sell placement, and we don’t keep you scrolling. It makes its money in plain ways, from what happens on it, and keeps what it needs to run. It’s created to benefit its members first and foremost. We collect data to benefit our members, never to enrich shareholders or investors, and we make it easy to opt out.',
      ],
    },
    {
      id: 'product',
      title: 'What we’re building',
      intro: 'Right now, in one area, with the people on the waitlist:',
      list: [
        'A Page for a business or a group: who you are, what you’re about, where you’ll be.',
        'Posts, and a time on a Post makes it an event. A map shows where things are happening.',
        'Follow a Page and get its updates in the app instead of in your inbox.',
        'A way to report anything that doesn’t belong, with a person looking at every report.',
      ],
      after: 'After that, in rough order:',
      later: [
        'Search by what you’re into, and tags you write yourself.',
        'Listings for what you sell or offer, and buying and selling inside the app.',
        'Floating an idea before it exists, so people can say they want it.',
        'Asking for help, and offering it.',
        'Messaging, once the safeguards are in place.',
        'More areas, opened as the people in them ask.',
      ],
      outro: 'Each one shows up when it’s ready, not on a date.',
    },
    {
      id: 'company',
      title: 'How the company takes shape',
      body: [
        'Today this is one person and a small company set up to run it. The plan is for the company to change shape as real people and real activity arrive, each step taken when the thing that calls for it exists:',
      ],
      steps: [
        'A small company, so there’s something to build under.',
        'A public benefit corporation, with the mission written into its charter.',
        'Built to serve the members: a member body, so people have a real say in what happens where they live.',
        'A structure that keeps the mission in place, so this can’t be sold out from under the people on it.',
      ],
      after: [
        'We currently don’t take money from venture capital or private equity. This stays grassroots, and it’s built for the small shop, the one-person operation, and the group with twelve people in it.',
      ],
    },
    {
      id: 'who',
      title: 'Who this is set up for',
      body: [
        'The people this serves are the people who build it: whoever runs a Page, puts on an event, holds a group together, or shows up. That’s who it answers to.',
        'It’s for people who care about each other and the place they live. Chains and companies owned by a fund have plenty of places to be found already. This isn’t one of them.',
        'Other apps call you users. A user is someone a product is done to. A member is someone it’s built to serve. We’re in this together.',
      ],
    },
  ],
} as const
