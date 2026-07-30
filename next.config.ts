import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // distDir is overridable via BUILD_DIST so a production `next build` used for
  // verification can write to a throwaway directory (e.g. .next-verify) instead
  // of clobbering the `.next` that a running `next dev` server depends on.
  // Unset (the normal case) → default `.next`, identical to stock behaviour.
  ...(process.env.BUILD_DIST ? { distDir: process.env.BUILD_DIST } : {}),

  // NO `output: "standalone"`.
  //
  // It was here to shrink the container, but it is incompatible with the way
  // this app actually starts: `next start` refuses to serve a standalone build
  // ("next start does not work with output: standalone" — Next says so at boot,
  // then serves a broken tree). Standalone only pays off when a Dockerfile
  // copies `.next/standalone` into a bare image; nixpacks keeps node_modules in
  // the same container either way, so the saving was theoretical and the
  // breakage was real.
  //
  // If the image size ever matters: switch the start command to
  // `node .next/standalone/server.js` AND copy `.next/static` + `public` into
  // `.next/standalone` after the build. Both halves, or it serves no CSS.

  // The Supabase JS client is CommonJS-heavy; this keeps it out of the client
  // bundle where it isn't needed.
  serverExternalPackages: ["@supabase/supabase-js"],

  experimental: {
    // Client-side router cache. Next 15 ships this at 0 for dynamic routes,
    // which means Customers → a customer → Back re-fetches the whole list from
    // the server every time. On pages that barely changed, that reads as lag
    // on every step — which is exactly the complaint.
    //
    // 30s is deliberately short: this is a CRM where two people edit the same
    // rows, and a stale balance is a real hazard. Long enough that back/forward
    // and tab-flipping feel instant, short enough that nobody works from
    // half-minute-old money. Anything YOU change still updates immediately —
    // every server action revalidates its own paths.
    staleTimes: { dynamic: 30, static: 180 },
  },
};

export default nextConfig;
