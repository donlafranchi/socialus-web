// /landing — a preview of the new front door (Don, 2026-10-08). Not linked
// from anywhere and noindex until he rules on it. Copy follows
// socialus-plan product/foundation/voice-and-tone.md; the headline and the
// "near you" verb each need a dated DECISIONS.md line before this goes public
// (they differ from the locked name line and the 2026-09-30 "near you" ruling).

export const LANDING = {
  headline: 'A local discovery platform, for the people.',
  subhead: 'Find the local, the quirky, the one of a kind, and the people behind it.',
  verbs: [
    'Find what’s good near you, and get found.',
    'Start something new for people who love what you love.',
    'Shape your community, and help build what comes next.',
  ],
  ctas: { primary: 'Get on the list', secondary: 'How we’re different' },
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
      'People searching for what you do find you by what you do, not by what you paid. Nobody buys their way to the top here.',
    ],
  },
  offline: {
    title: 'Online, then off',
    body: 'The internet is good for one thing here: helping people find each other. Everything after that happens in person. Find your people on the screen, then put it down and go meet them.',
  },
  members: {
    body: 'Other apps call you users. We call you members. We’re in this together, and this is for us.',
    link: 'How we’re different',
  },
  waitlist: {
    title: 'Get on the list',
    email: 'Email',
    zip: 'Zip code',
    runs: 'I run a business or group',
    help: 'I’d help build this',
    submit: 'Put me on the list',
    busy: 'Just a moment…',
    note: 'We’re opening one community at a time. You’ll hear from us when yours is ready, and that’s all we use your email for.',
    done: {
      waiting: 'You’re on the list. You’ll hear from us when your area opens.',
      open: 'Your area is open. Sign up and have a look.',
      outside: 'We’re not in your area yet. We’re opening one community at a time.',
    },
    errors: {
      email: 'That does not look like an email address.',
      zip: 'Enter a 5-digit zip code.',
      failed: 'That didn’t go through. Mind trying again?',
    },
  },
  footer: { signoff: 'See you out there.' },
} as const

export const ABOUT = {
  title: 'How we’re different',
  sections: [
    {
      id: 'mission',
      title: 'What this is for',
      body: [
        'SocialUs connects people in real life. That’s the whole job. Find what’s good where you live, find the people behind it, and go meet them.',
        'Small shops, people who make things, and groups that meet on Tuesdays are what hold a place together. On their own, each one is easy to miss. Once they find each other, they add up to something the big outfits can’t match. This is a place for them to find each other.',
        'SocialUs is never extractive. It doesn’t sell your data. It doesn’t sell placement. It doesn’t keep you scrolling. It makes its money in plain ways, from what happens on it, and keeps what it needs to run.',
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
      outro: 'Each of these lands when it’s ready, not on a date.',
    },
    {
      id: 'company',
      title: 'How the company grows up',
      body: [
        'Today this is one person and a small company set up to run it. The plan is for the company to change shape as real people and real activity arrive, each step taken when the thing that calls for it exists:',
      ],
      steps: [
        'A small company, so there’s something to build under.',
        'A public benefit corporation, with the mission written into its charter.',
        'A member body, so people have a real say in what happens where they live.',
        'A structure that locks the mission in, so this can’t be sold out from under the people on it.',
      ],
      after: [
        'We don’t take money from traditional investors. No venture capital, no private equity. This stays grassroots, and it’s built for the small shop, the one-person operation, and the group with twelve people in it.',
      ],
    },
    {
      id: 'who',
      title: 'Who this is set up for',
      body: [
        'The people this serves are the people who build it: whoever runs a Page, puts on an event, holds a group together, or shows up. That’s who it answers to.',
        'It’s for people who care about each other and the place they live. Chains and companies owned by a fund have plenty of places to be found already. This isn’t one of them.',
        'Other apps call you users. A user is someone a product is done to. A member is someone it belongs with. We’re in this together, and this is for us.',
      ],
    },
  ],
} as const
