import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
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
