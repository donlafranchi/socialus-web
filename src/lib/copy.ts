// The app's words, one typed module (F084, draft). A missing key fails the
// build. Copy is Don's and a draft until he says otherwise ([public-is-draft]).

export const COPY = {
  // F080 criterion 5 — shown wherever a member posts. Placeholder, Don's 2026-09-30 short line.
  postingSafety:
    "Be cool, don't be a jerk. Leave out kids, pets and anyone who can't speak up for themselves.",
  // F080 criterion 5 — ticked for each photo before it can be chosen. Placeholder ([public-is-draft]).
  photoConfirm: 'No kids in this photo.',
  // F102 criterion 10 — shown once "Threat of harm" is picked. Placeholder ([public-is-draft]).
  report911: "If someone's in danger right now, call 911 first. We'll look into this too.",
  // F100 — the operator's row and detail, when a report was held back from the AI. Placeholder ([public-is-draft]).
  aiNotRead: 'Not read by the AI: a person needs to look.',
  // #627, the PM's calls of 2026-10-11 — the report sheet, before Send, and the line after it.
  reportCourtesy:
    "We'll first send the page owner a courtesy notice so they can fix it. We don't share who you are. Please don't misuse reports.",
  reportUrgentSkip:
    "For this one we skip the courtesy notice: it's hidden right away and a person from our team takes a look. We don't share who you are. Please don't misuse reports.",
  // #625 — a Page's own words are reportable on their own (placeholder copy, [public-is-draft]).
  reportPageWords: 'Report this Page',
  reportPagePhoto: "Report this Page's photo",
  reportPageWordsSubject: 'its name or description',
  pageWordsHiddenNote: "Your Page's name and description are hidden from others after a report. Edit either one to show them again.",
  reportSentCourtesy: 'The Page owner gets a courtesy notice first. Thanks for being decent.',
  reportSentPerson: "It's being sent to a person from our team. Thanks for being decent.",
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
  // F081.9 — a VoIP number is asked for a mobile one. Placeholder ([public-is-draft]).
  phoneVoip: 'Please use a mobile number. We can’t text a code to an internet phone number.',
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
  unclaimedContact: 'Email or phone',
  unclaimedRemoveReason: 'Why (optional)',
  unclaimedRemoveConfirm: 'I represent this business, or it is about me, and I want it removed.',
  unclaimedRemoveSend: 'Remove this Page',
  unclaimedRemoveSent: "Done. This Page is hidden now and we'll review it.",
  unclaimedRemoveWhat: 'What should we remove?',
  unclaimedRemoveWholePage: 'The whole Page',
  unclaimedRemovePhoto: 'Just the photo',
  unclaimedRemovePhotoSent: "Done. The photo is hidden now and we'll review it.",
  // #987 — self-serve claim. New copy, listed in the PR for review ([public-is-draft]).
  claimSignIn: 'Sign in to claim this Page',
  claimIntro: "We'll send a code to the business. Enter it here and the Page is yours right away.",
  claimEmailLabel: (domain: string) => `Your email at ${domain}`,
  claimEmailSend: 'Email me a code',
  claimPhoneSend: (masked: string) => `Text a code to ${masked}`,
  claimCodeSentTo: (to: string) => `We sent a 6-digit code to ${to}. It works for 15 minutes.`,
  claimCodeLabel: 'Code',
  claimConfirm: 'Claim this Page',
  claimResend: 'Send a new code',
  claimDone: 'This Page is yours. Post your first news below.',
  claimWrongCode: "That code isn't right. Check it and try again.",
  claimExpired: 'That code has expired. Send a new one.',
  claimTaken: "Someone has already claimed this Page. If it's yours, report the Page and we'll sort it out.",
  claimProofIntro:
    "This Page has no website or phone we can send a code to. Send a link that shows it's yours, like a photo of you at the business or the business's own social profile.",
  claimProofLabel: 'Link to your proof',
  claimProofNote: 'Anything we should know (optional)',
  claimProofSend: 'Send for review',
  claimProofSent: "Thanks. We'll look at it soon, and the Page is yours once it checks out.",
  claimCodeSubject: (page: string) => `Your code to claim ${page} on SocialUs`,
  claimCodeBody: (code: string, page: string) =>
    `Your SocialUs code is ${code}. Enter it on the ${page} Page to claim it. It works for 15 minutes. If you didn't ask for this, ignore it.`,
  // The ethos's decency lines (2026-10-25). New copy, listed in the PR for review ([public-is-draft]).
  decencyThanks: 'Thanks for being decent.',
  postedThanks: 'Posted. Thanks for being decent.',
  rulesHeadline: "Be cool. Don't be a jerk.",
  rulesIntro: "We assume the best of each other. These are for the rare times that doesn't hold.",
  unclaimedLimit: "You've sent several requests today. Please try again tomorrow.",
  unclaimedFailed: "That didn't go through. Please try again.",
  // F117 — new copy, listed in the PR for review ([public-is-draft]).
  wonderCount: (n: number, of: number) => `${n.toLocaleString('en-US')} of ${of.toLocaleString('en-US')} in`,
  wonderBarLabel: 'People in so far',
  wonderReached: 'Goal reached. Still counting.',
  wonderImIn: "I'm in",
  wonderPickSize: 'Pick your size',
  wonderJoinSave: 'Count me in',
  wonderPickSizeError: 'Pick one of the sizes.',
  wonderYoureIn: (option: string | null) => (option ? `You're in, size ${option}.` : "You're in."),
  wonderChangeSize: 'Change size',
  wonderLeave: 'Leave',
  wonderHelp: 'I can help',
  wonderHelpTitle: 'I can help as…',
  wonderHelpNote: 'A short note (optional)',
  wonderHelpSend: 'Offer to help',
  wonderHelpPickRole: 'Pick at least one role.',
  wonderHelpSent: 'Thanks. The poster will see your offer.',
  wonderYourOffers: 'Your offers',
  wonderWithdraw: 'Take back',
  wonderStatus: { pending: 'Waiting to hear', accepted: 'Accepted', declined: 'Not this time' },
  wonderHelpers: 'Helping',
  wonderRoles: {
    lead: 'Lead',
    designer: 'Designer',
    pattern_maker: 'Pattern-maker or sampler',
    sourcing: 'Sourcing',
    quality: 'Quality',
    logistics: 'Logistics',
    support: 'Support',
    treasurer: 'Treasurer',
  },
  wonderSizes: 'By size',
  wonderPeople: "Who's in",
  wonderNobodyYet: 'Nobody yet.',
  wonderOffers: 'Offers to help',
  wonderAccept: 'Accept',
  wonderDecline: 'Decline',
  wonderToggle: "Make it a Wonder: ask who's in",
  wonderThreshold: 'How many people would make it happen?',
  wonderOptionsLabel: 'Sizes or options (optional, commas between)',
  wonderOptionsPlaceholder: 'S, M, L',
  wonderComposerNote: "People can say they're in, pick a size, and offer to help. No money changes hands.",
  wonderThresholdInvalid: 'Enter a whole number, 1 or more.',
  wonderPost: 'Post Wonder',
} as const
