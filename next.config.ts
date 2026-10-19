import type { NextConfig } from "next";

/**
 * Sent on every response. There is no Content-Security-Policy: Next needs a
 * per-request nonce for its inline scripts, and reading one makes every page
 * render on demand, which would undo prerendering all 1,350 of them.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // No one has a reason to put the site in a frame; this stops clickjacking.
  { key: "X-Frame-Options", value: "DENY" },
  // Shops still see visits came from us, but never which page or search.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  // The old address keeps working for anyone with a link, and Google moves its
  // index to pcprice.lk instead of seeing the same site under two names.
  // Preview deployments have their own hostnames and are not affected.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "sl-pc-part-picker.vercel.app" }],
        destination: "https://pcprice.lk/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
