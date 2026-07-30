import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // distDir is overridable via BUILD_DIST so a production `next build` used for
  // verification can write to a throwaway directory (e.g. .next-verify) instead
  // of clobbering the `.next` that a running `next dev` server depends on.
  // Unset (the normal case) → default `.next`, identical to stock behaviour.
  ...(process.env.BUILD_DIST ? { distDir: process.env.BUILD_DIST } : {}),

  // Railway runs the app in a container, not on Vercel's platform. `standalone`
  // emits a self-contained server with only the node_modules it actually needs,
  // which is what keeps the image small and the cold start quick.
  output: "standalone",

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
