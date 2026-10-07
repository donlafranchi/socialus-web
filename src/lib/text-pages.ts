// #296 — the text pages the footer links to. Content lives here, next to the
// copy module, so Don's drafts replace a placeholder without touching a
// screen.
//
// #489 — live before the first signup. Terms and Privacy are DRAFTS written only
// from rulings (what we collect, who sees it, the 18+ line, the children rule).
// They are plain-language statements of what the product does, not legal
// drafting: everything a lawyer must write or approve is listed in `counsel`,
// which is never rendered. When counsel's text lands it replaces `body` and
// `counsel` goes empty. Nothing here promises the future, and there is no line
// about not selling member information (ruled 2026-09-30).

export interface TextPageContent {
  slug: 'about' | 'terms' | 'privacy'
  title: string
  status: 'placeholder' | 'draft' | 'live'
  /** Paragraphs, in order. Empty for a placeholder. */
  body: string[]
  /** What counsel must supply or approve before this is in effect. Never rendered. */
  counsel?: string[]
}

export const TEXT_PAGE_PLACEHOLDER = 'This page is being written. It is not yet in effect.'

export const TEXT_PAGES: Record<TextPageContent['slug'], TextPageContent> = {
  about: {
    slug: 'about',
    title: 'About',
    status: 'draft',
    // F081 criterion 5's line, Don's words (2026-10-01). Placeholder [public-is-draft].
    body: [
      'This is a community building app. It was made for good and decent people to find, connect with and support other good and decent people. We are here to build a better future together.',
    ],
  },
  terms: {
    slug: 'terms',
    title: 'Terms',
    status: 'draft',
    body: [
      'SocialUs is a place for good and decent people to find, connect with and support each other. These Terms describe how it works during the beta.',
      'You need to be 18 or older to use SocialUs. By signing up you confirm that you are 18 or older and agree to these Terms.',
      'Use one account, in your own name. Other members see only your display name.',
      'Be kind and decent. Please don’t post anything sensitive, like content involving children, pets, or anyone who can’t speak up for themselves, and please don’t post pictures with children in them.',
      'Anyone can report a post or a photo. A report can hide it at once while a person looks. If something of yours is hidden, we tell you why and you can answer before anything more happens.',
      'You are responsible for what you post, and for the Pages you run. Pages belong to the people who make them.',
      'We can hide or remove content, and close accounts, that break these Terms.',
      'This is a beta. Things will change, break and get fixed, and SocialUs does not handle payments during it.',
    ],
    counsel: [
      'The license a member gives SocialUs to show what they post, and who owns it',
      'Limitation of liability and the disclaimer of warranties',
      'Governing law and how disputes are settled',
      'Copyright takedown: the designated agent and the notice-and-counter-notice process',
      'Suspension and termination: grounds, notice and appeal',
      'The age gate: the 18+ wording, and what happens when someone under 18 is found',
      'How changes to the Terms are announced and accepted',
      'The definition of prohibited content, including the child-safety rules and the duty to report',
    ],
  },
  privacy: {
    slug: 'privacy',
    title: 'Privacy',
    status: 'draft',
    body: [
      'This is what SocialUs collects and who can see it. It describes the beta.',
      'When you sign up we ask for your legal name, your email, your zip code and a display name, and for you to confirm you are 18 or older. If we ask you to verify a phone number, it is only to check that you are a real person.',
      'Your display name, and the Pages and posts you publish, can be seen by other members. Visitors who are not signed in see a limited list.',
      'Your legal name, your email and your phone number are seen only by operators. Your zip code is never shown to another member or to a visitor; it is used to place you in your metro, and you can change it from your account.',
      'A Page shows the area it is in, and an exact address only when the owner has made one public.',
      'When something is reported, an automated first pass may read the reported post before a person makes the call. A person always decides.',
      'You can archive or delete a Page you run. A deleted Page can be restored for 14 days.',
      'When you post or upload, we record the internet address and time it came from, to keep SocialUs safe. Only operators can see it, and it is deleted after one year.',
    ],
    counsel: [
      'Retention periods for each kind of data, and for removed content',
      'California privacy rights (CCPA/CPRA): the notice, and how a request is made and answered',
      'The full list of services that process data for SocialUs, and what each receives',
      'Cookies and analytics disclosures',
      'Disclosure of the automated review of reported posts',
      'Children’s data: the statement that SocialUs is for adults, and what happens if a child’s data is found',
      'Deletion of an account and its data',
      'Breach notification, and a privacy contact address',
    ],
  },
}
