// The signed-out home at `/`. Don's reviewed copy (2026-10-26), word for word.
// `TODO(Don)` marks a line he hasn't approved yet; nothing else here should
// change without him.

export const HOME_TODO = {
  // Don, 2026-10-26: Sacramento and the towns around it.
  launchMarket: 'Sacramento',
  // Don, 2026-10-26: one sign-up path for everyone; the zip decides what comes after.
  primaryCta: 'Join SocialUs',
  launchAction: 'create your account',
  // TODO(Don): new line (2026-10-26) for people outside Sacramento: one sign-up for everyone.
  outOfMarket: 'Somewhere else? Join anyway. If enough people near you join, we could open there next.',
}

const T = HOME_TODO

// TODO(Don): where Contact goes (a page or a mailto:). Null leaves it off the footer.
export const CONTACT_HREF: string | null = null

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
      body: 'Find businesses owned and operated by locals. Get to know the places around you and the people behind them.',
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
      'We want to help bring back third spaces: places beyond home and work where people spend time together. SocialUs helps people find each other and organize. The goal is to give those connections somewhere to grow in real life.',
    ],
  },
  launch: {
    title: `Starting in ${T.launchMarket}.`,
    body: [
      'We’re launching in one market first. From there, people who meet our requirements will be able to open SocialUs in new markets.',
      `If you’re in ${T.launchMarket}, ${T.launchAction}.`,
    ],
    outOfMarket: T.outOfMarket,
  },
  footer: {
    line: 'Designed to get people together in real life.',
    links: [
      { href: '/about', label: 'About' },
      // TODO(Don): no contact page or address exists, and Report needs a sign-in; hidden until there is one.
      { href: CONTACT_HREF, label: 'Contact' },
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
    ].filter((l): l is { href: string; label: string } => l.href !== null),
  },
}

export const JOIN_HREF = '/auth/login'
