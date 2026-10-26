// #1090 — new words for the one sign-up path and /open/<market>. All of them
// wait on Don's review (human-review PR); his own lines are marked.

export const OPEN_COPY = {
  // Don, 2026-10-26 (grammar tidied only).
  notOpen: (name: string) => `We’re not open in ${name} yet.`,
  notOpenBody: 'If enough people there join, we could open yours next.',
  open: (name: string) => `SocialUs is open in ${name}.`,
  makers: 'Makers',
  supporters: 'Supporters',
  of: (count: number, goal: number) => `${count.toLocaleString('en-US')} of ${goal.toLocaleString('en-US')}`,
  share: (name: string) => `Help open SocialUs in ${name}`,
  shareButton: 'Share this page',
  copied: 'Link copied',
  join: 'Join SocialUs',
}

export const SIGNUP_ROLE_COPY = {
  legend: 'Are you here mainly to…',
  maker: 'Make, sell or organize',
  makerHint: 'A business, maker, creator or organizer',
  supporter: 'Find and support them, and show up',
  link: 'Website or socials (optional)',
}
