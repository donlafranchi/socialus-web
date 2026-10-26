// The signed-out home at `/`. Don's reviewed copy (2026-10-26), word for word.
// Every `TODO(Don)` value is still his bracket, shown as-is until Dispatch
// fills it from his answers; nothing else here should change without him.

export type PrimaryAction = 'signup' | 'waitlist'

// TODO(Don): 'signup' sends the primary button to email → 6-digit code;
// 'waitlist' sends it to the zip waitlist form at the bottom of the page.
export const PRIMARY_ACTION: PrimaryAction = 'signup'

export const HOME_TODO = {
  // TODO(Don): the launch market's name.
  launchMarket: '[launch market]',
  // TODO(Don): "Join SocialUs" for signup, "Join the waitlist" for waitlist.
  primaryCta: '[Join SocialUs / Join the waitlist]',
  // TODO(Don): "create your account" or "join the waitlist".
  launchAction: '[create your account / join the waitlist]',
  // TODO(Don): the confirmed next step for someone outside the launch market.
  outOfMarket: '[Add the confirmed next step for your area.]',
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
    outOfMarket: { lead: 'Not in the launch market?', next: T.outOfMarket },
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

export const primaryHref = (action: PrimaryAction) => (action === 'signup' ? '/auth/login' : '#join')
