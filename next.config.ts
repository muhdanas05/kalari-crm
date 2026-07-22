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
};

export default nextConfig;
