// #904 — every word a member reads about notifications, in one place, so the monthly review can list and change
// them by one PR. New copy: Don approves ([public-is-draft]).

export const NOTIFY_COPY = {
  rowLabel: 'Alerts',
  rowValue: 'Choose what we send you',
  rowAction: 'Choose',
  title: 'Notifications',
  intro: 'Nothing is on until you turn it on. Turn anything off at any time.',
  followPosts: 'New posts from Pages I follow',
  followPostsHint: 'At most 3 a day, grouped together.',
  weekend: 'This weekend near me',
  weekendHint: 'Thursday evening, what’s on this weekend from Pages you follow and the things you like.',
  quietHours: 'Quiet hours',
  quietHint: 'Nothing arrives between these times. It waits until they end.',
  quietFrom: 'From',
  quietTo: 'To',
  pause: 'Pause all',
  pauseHint: 'Nothing arrives until you turn this off. Your choices stay.',
  allowAsk: 'To send these, your browser will ask you to allow notifications.',
  blocked: 'Notifications are blocked for SocialUs in this browser. Allow them in your browser’s site settings, then come back.',
  unsupported: 'This browser can’t receive notifications.',
  iosInstall: 'On iPhone, add SocialUs to your Home Screen first: tap Share, then Add to Home Screen, then open SocialUs from there.',
  iosOld: 'Notifications on iPhone need iOS 16.4 or later.',
  saved: 'Saved.',
  failed: 'That didn’t save. Mind trying again?',
  signedOut: 'Sign in to choose your notifications.',
  // The landing bar, on the screen a notification opens.
  landingFollow: 'You get these when Pages you follow post.',
  landingWeekend: 'You get this every Thursday.',
  landingOff: 'Turn these off',
  landingDone: 'Turned off. You can turn them back on under You.',
  // The notifications themselves.
  followOneTitle: (page: string) => page,
  followManyTitle: (n: number) => `${n} new posts from Pages you follow`,
  followManyBody: (pages: string[]) =>
    pages.length <= 2 ? pages.join(' and ') : `${pages.slice(0, 2).join(', ')} and ${pages.length - 2} more`,
  weekendTitle: 'This weekend near you',
  weekendBody: (n: number, followed: number) =>
    `${n} ${n === 1 ? 'thing' : 'things'} on${followed > 0 ? `, ${followed} from Pages you follow` : ''}.`,
} as const
