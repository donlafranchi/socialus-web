// #296 — the text pages the footer links to. Content lives here, next to the
// copy module, so Don's drafts replace a placeholder without touching a
// screen. Terms and Privacy are placeholders until those drafts land (starter
// kit: the Claude Docs "terms and privacy" doc, 2026-10-01). No legal text is
// written here: a placeholder says it is not in effect, and nothing more.

export interface TextPageContent {
  slug: 'about' | 'terms' | 'privacy'
  title: string
  status: 'placeholder' | 'draft' | 'live'
  /** Paragraphs, in order. Empty for a placeholder. */
  body: string[]
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
  terms: { slug: 'terms', title: 'Terms', status: 'placeholder', body: [] },
  privacy: { slug: 'privacy', title: 'Privacy', status: 'placeholder', body: [] },
}
