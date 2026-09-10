import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // `/following` is the pre-rebuild duplicate of the shipped `/you/following`.
      // The route file stays on disk until the vendor sweep runs (gated on T125
      // and T126); this shadows it in the meantime, so the address answers with
      // the real surface instead of a second, broken copy.
      { source: '/following', destination: '/you/following', permanent: false },
      { source: '/business/:slug', destination: '/vendors/:slug', permanent: false },
      { source: '/map', destination: '/explore?view=map', permanent: false },
      { source: '/register-business', destination: '/register-vendor', permanent: false },
      { source: '/qr', destination: '/join', permanent: false },
    ]
  },
};

export default nextConfig;
