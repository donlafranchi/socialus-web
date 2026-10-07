// The app's words, one typed module (F084, draft). A missing key fails the
// build. Copy is Don's and a draft until he says otherwise ([public-is-draft]).

export const COPY = {
  // F080 criterion 5 — shown wherever a member posts. Placeholder, Don's 2026-09-30 short line.
  postingSafety:
    "Please don't post anything sensitive, like content involving children, pets, or anyone who can't speak up for themselves. We rely on each other to keep this place kind and decent.",
  // F080 criterion 5 — ticked for each photo before it can be chosen. Placeholder ([public-is-draft]).
  photoConfirm: 'This photo has no children in it.',
  // F102 criterion 10 — shown once "Threat of harm" is picked. Placeholder ([public-is-draft]).
  report911: "If someone is in danger right now, please call 911 first. We'll look at this too.",
  // The same ask in full, for the rules page (#223). Placeholder, Don's 2026-09-30 line. Not shown yet.
  postingSafetyFull:
    "While we grow into a platform with a full team, we're asking for your help. Please don't post anything sensitive: content involving children, pets, or anyone who can't speak up for themselves, or anything unpleasant we'd have to ask a person on our team to look at. We look out for you, and we ask you to look out for us and each other. We rely on each other to keep this place kind and decent. Let's make it an example of the future we want to build together.",
  // F093 criterion 8 — the withheld card's ask, the front door's main button.
  // Don's words, 2026-10-04 ("Sign up to follow" is the secondary). Placeholder.
  withheldCta: "Sign in to see what's happening",
  // #260 — downloads an .ics. Placeholder ([public-is-draft]).
  addToCalendar: 'Add to calendar',
  // F081 criterion 5 — what the app is for, on the signup screen. Don's words, ruled 2026-10-01.
  signupLine:
    'This is a community building app. It was made for good and decent people to find, connect with and support other good and decent people. We are here to build a better future together.',
  // F081 — the text-message code at signup (2026-10-01). Placeholders ([public-is-draft]).
  phoneTitle: 'Verify your phone',
  phoneWhy: "Everyone here is a real person. We'll text you a code to check. Your number is never shown to anyone.",
  phoneInvalid: 'Enter a US phone number, like (916) 555-0134.',
  phoneSendFailed: "We couldn't send a code to that number. Check it and try again.",
  phoneCodeTitle: 'Enter your code',
  phoneCodeSent: 'We texted you a 6-digit code.',
  phoneCodeWrong: "That code didn't match. Check it, or send a new one.",
  // F091 — Don's stem, 2026-09-19; each row completes it. The ellipsis is his.
  happeningStem: 'What’s happening…',
  happeningToday: 'today',
  happeningThisWeek: 'this week',
  happeningThisWeekend: 'this weekend',
  // #353 — real businesses added from public info (Don, 2026-10-04). Placeholders ([public-is-draft]).
  unclaimedLabel: 'Unclaimed: added from public info',
  unclaimedDescriptionCredit: 'From their website',
  unclaimedBoxTitle: 'Is this your business?',
  unclaimedBoxBody: 'We added this Page from public information so neighbors can find you. Claim it to tell your own story, or ask us to take it down.',
  unclaimedClaim: 'Claim this Page',
  unclaimedRemove: 'Ask us to remove it',
  unclaimedClaimName: 'Your name',
  unclaimedContact: 'Email or phone',
  unclaimedClaimMessage: 'Anything we should know (optional)',
  unclaimedClaimSend: 'Send',
  unclaimedClaimSent: "Thanks. We'll be in touch to confirm it's yours.",
  unclaimedRemoveReason: 'Why (optional)',
  unclaimedRemoveConfirm: 'I represent this business, or it is about me, and I want it removed.',
  unclaimedRemoveSend: 'Remove this Page',
  unclaimedRemoveSent: "Done. This Page is hidden now and we'll review it.",
  unclaimedRemoveWhat: 'What should we remove?',
  unclaimedRemoveWholePage: 'The whole Page',
  unclaimedRemovePhoto: 'Just the photo',
  unclaimedRemovePhotoSent: "Done. The photo is hidden now and we'll review it.",
  unclaimedLimit: "You've sent several requests today. Please try again tomorrow.",
  unclaimedFailed: "That didn't go through. Please try again.",
} as const
