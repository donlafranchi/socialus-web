// The signed-out home at `/`. The copywriter's final copy (2026-10-31), word for word;
// layout and look follow Don's concept of the same day.
// `TODO(Don)` marks something still pending; nothing else here changes without him.

export const HOME_TODO = {
  // Don, 2026-10-26: Sacramento and the towns around it.
  launchMarket: 'Sacramento',
  // Don, 2026-10-26: one sign-up path for everyone; the zip decides what comes after.
  primaryCta: 'Join SocialUs',
}

const T = HOME_TODO

// TODO(Don): consent line under the last Join button; the copywriter's final wording and its Terms/Privacy links are pending. Null leaves it off.
export const CONSENT_LINE: string | null = null

// Don's illustration (2026-10-31): the whole square in the hero, its café corner beside Third spaces.
export const ART = {
  hero: {
    srcSet: '/home/square-768.webp 768w, /home/square-1200.webp 1200w, /home/square-1536.webp 1536w',
    src: '/home/square-1200.webp',
    width: 1536,
    height: 1024,
    alt: 'Illustration of a sunny town square: people talk on a bench around an olive tree, shop at a market stall, sit outside a café and walk a dog.',
  },
  thirdSpaces: {
    srcSet: '/home/cafe-600.webp 600w, /home/cafe-1080.webp 1080w',
    src: '/home/cafe-1080.webp',
    width: 1080,
    height: 810,
    alt: 'Illustration of people at café tables and a market stall, stopping to talk.',
  },
}

export const HOME = {
  nav: {
    links: [
      { href: '#groups-and-events', label: 'Groups & events' },
      { href: '#local-businesses', label: 'Local businesses' },
      { href: '#why', label: 'Why SocialUs' },
    ],
  },
  hero: {
    lines: ['Online is cool.', 'Real life is better.'],
    body: [
      'SocialUs was designed to get people together in real life. Find groups and events, support locally owned businesses, and organize with people who want to make things happen.',
      'Meet people who share your interests. Get a group going. Do something together.',
    ],
    launch: `Launching first in ${T.launchMarket}.`,
    secondary: 'See what you can do',
  },
  can: [
    {
      id: 'groups-and-events',
      title: 'Find something to show up for.',
      body: 'Discover events and groups around your interests. Find people you’d like to spend time with, then meet them in person.',
    },
    {
      id: 'get-people-together',
      title: 'Get people together.',
      body: 'Start a group or organize an event around something you care about. A hobby, a shared ambition, a project you want to get off the ground. Find others who want to be part of it.',
    },
    {
      id: 'local-businesses',
      title: 'Support people who live here.',
      body: 'Find businesses owned and operated by locals. Get to know the places around you and the people behind them, so you know who you’re supporting and why.',
    },
  ],
  why: {
    title: 'We don’t need another reason to keep scrolling.',
    body: [
      'We need ways to get out of the house, get to know each other, and do things together.',
      'That’s what SocialUs is for. The platform should work for you, not make you work for its algorithm. Finding a group, making a plan, meeting someone face to face: that’s the point.',
      'We want decent people to find each other and work together on a better future. That can start with something as simple as meeting up.',
    ],
  },
  thirdSpaces: {
    title: 'Somewhere to go. People to see.',
    body: [
      'The cafe where you meet every week. A group that gets together at the park. A local spot where people start to know your name.',
      'We want to help bring back third spaces: places beyond home and work where people spend time together. SocialUs helps people find each other and organize. The goal is to give those connections somewhere to grow in real life. Familiar places. People you get to know over time.',
    ],
  },
  launch: {
    title: `Starting in ${T.launchMarket}.`,
    body: [`${T.launchMarket} is our first open market. If you’re here, join us.`],
    outOfMarket: `Not in ${T.launchMarket}? You can join too. We’re not open in your area yet. If enough people there join, we could open yours next.`,
  },
  footer: {
    line: 'Designed to get people together in real life.',
    links: [
      { href: '/about', label: 'About' },
      // TODO(Don): add Contact here once its destination exists (the socialus.org mailbox).
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
    ],
  },
}

export const JOIN_HREF = '/auth/login'
