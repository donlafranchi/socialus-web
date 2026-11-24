import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // #978 — sharp's native image library (17 MB) was packed into 41 of 53 routes because Next's own runtime
  // names it. Nothing deployed uses it (no next/image; the importer's photo resize runs from scripts/), and the
  // bigger the function, the longer a cold start.
  outputFileTracingExcludes: { '*': ['node_modules/@img/**', 'node_modules/sharp/**'] },
  // #641 — member photos are served from our own address so Cloudflare's cache, and its CSAM Scanning Tool, sit in
  // front of them. Same object, same path, so nothing that reads a photo's address changes.
  async rewrites() {
    const storage = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!storage) return []
    return [{ source: '/storage/v1/object/public/media/:path*', destination: `${storage}/storage/v1/object/public/media/:path*` }]
  },
  async redirects() {
    return [
      // Don, 2026-10-31: the Rules page is gone; its rules live in the Terms.
      { source: '/rules', destination: '/terms', statusCode: 301 },
      // The old /landing preview is gone; `/` is the front door.
      { source: '/landing/:path*', destination: '/', permanent: false },
      // `/` is the signed-out front door now; the proxy sends a signed-in member to Explore.
      // `/following` is the pre-rebuild duplicate of the shipped `/you/following`.
      // The route file is still on disk; this shadows it, so the address answers
      // with the real surface instead of a second, broken copy.
      { source: '/following', destination: '/you/following', permanent: false },
      // `/business/:slug` and `/register-business` used to forward into the
      // vendor funnel. Vendors are retired (DECISIONS 2026-09-16) and both
      // destinations are deleted, so the old addresses now land on the surfaces
      // that replaced them: a Page lives at `/p/...`, and creating one starts
      // at `/you`. Kept rather than dropped — a link in the wild should reach
      // something, not 404.
      { source: '/business/:slug', destination: '/explore', permanent: false },
      { source: '/map', destination: '/explore?view=map', permanent: false },
      { source: '/register-business', destination: '/you', permanent: false },
      { source: '/qr', destination: '/join', permanent: false },
      // #1320 — the waitlist's eight question screens became plans, business and contact.
      { source: '/join/local', destination: '/join/plans', permanent: false },
      { source: '/join/be-found', destination: '/join/business', permanent: false },
      { source: '/join/kind', destination: '/join/business', permanent: false },
      { source: '/join/called', destination: '/join/business', permanent: false },
      { source: '/join/name', destination: '/join/contact', permanent: false },
      { source: '/join/zip', destination: '/join/contact', permanent: false },
      { source: '/join/email', destination: '/join/contact', permanent: false },
      { source: '/join/phone', destination: '/join/contact', permanent: false },
    ]
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/sourcemaps/uploading/bundler-plugin-options/

  org: "lafranchi-et-al-llc",

  project: "socialus-web",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  // tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
