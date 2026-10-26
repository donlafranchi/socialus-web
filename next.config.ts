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
      // `/` only ever forwarded to Explore (src/app/page.tsx, Home paused 2026-09-17). Answered at the edge it skips a server render, about a second.
      { source: '/', destination: '/explore', permanent: false },
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
    ]
  },
};

export default nextConfig;
