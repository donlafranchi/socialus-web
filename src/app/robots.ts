// chore #199 — robots.txt.
//
// THE WEAKEST OF THE THREE LAYERS, AND IT GOES FIRST BECAUSE IT IS THE ONLY
// ONE WITH NO OPEN RULING BEHIND IT.
//
// What it does: answers a crawler that asks what it may take. Before this
// there was no robots.txt at all, and an absent file reads as "everything".
//
// What it does NOT do, and nothing here should ever claim otherwise:
//   - It stops nobody who ignores it. It is a request, not a control. The
//     Vercel firewall is the layer that refuses.
//   - IT DOES NOT COVER THE DATA AT ALL. The rows behind these pages are also
//     served by PostgREST on a *.supabase.co origin, with a publishable key
//     that ships in our own JavaScript. This file is scoped to
//     www.socialus.org and says nothing about that origin, which is not behind
//     our firewall either. A crawler that reads our bundle — which is what a
//     training crawler does — has a second door. Closing it is RLS, not
//     robots, and it is the open question.
//
// NOT llms.txt, DELIBERATELY. Crawlers do not fetch it; it is a convention for
// agents already pointed at a URL. A position built on it would read like a
// policy and enforce nothing.
//
// THE SPLIT: search engines are allowed, training crawlers are not.
// Being absent from search is not a privacy win — *who exists* is meant to be
// findable, and a Page nobody can find helps nobody. What is withheld is the
// corpus, not the existence.

import type { MetadataRoute } from 'next'

/**
 * Crawlers that collect for model training or for an answer engine that
 * substitutes for the visit.
 *
 * THIS LIST DATES, and that is the maintenance cost of this approach. Vendors
 * rename agents (`anthropic-ai` became `ClaudeBot`) and add them faster than
 * anyone updates a file. A test pins the ones that matter today so a rename is
 * caught by something going red rather than by nobody.
 *
 * Search crawlers are deliberately absent — `Googlebot` and `Bingbot` index,
 * and `Google-Extended` / `Applebot-Extended` are the training-only agents
 * their vendors split out precisely so this distinction can be made.
 */
export const TRAINING_CRAWLERS = [
  // OpenAI
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  // Anthropic
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'anthropic-ai',
  // Common Crawl — feeds a large share of everyone else's training sets, so
  // omitting it would undo most of this list.
  'CCBot',
  // Google / Apple / Meta training agents, split from their search crawlers
  'Google-Extended',
  'Applebot-Extended',
  'meta-externalagent',
  'FacebookBot',
  // Answer engines and the rest
  'Bytespider',
  'PerplexityBot',
  'Perplexity-User',
  'Amazonbot',
  'cohere-ai',
  'cohere-training-data-crawler',
  'Diffbot',
  'Omgilibot',
  'omgili',
  'ImagesiftBot',
  'Timpibot',
  'YouBot',
] as const

/**
 * Routes that are nobody's business but the signed-in person's, closed to
 * every agent including the search engines we do want.
 *
 * These are already closed by auth — this is not what protects them. It keeps
 * them out of an index, which is a different thing: a 302 to sign-in is still
 * a URL someone can find and a title someone can read.
 */
export const PRIVATE_PATHS = [
  '/you',
  '/manage/',
  '/admin/',
  '/api/',
  '/auth/',
  '/onboarding',
  '/following',
] as const

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [...PRIVATE_PATHS],
      },
      // One group, every named agent. A per-agent group would say the same
      // thing more times and give a future edit more places to be inconsistent.
      {
        userAgent: [...TRAINING_CRAWLERS],
        disallow: '/',
      },
    ],
  }
}
