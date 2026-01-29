import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use the default caching behavior. The experimental `cacheComponents`
  // mode is disabled to avoid conflicts with dynamic server-side auth
  // (e.g. Supabase `createClient()` in route segments like `/protected`).
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "acontext.io",
      },
    ],
    localPatterns: [
      // Allow local slide assets to include cache-busting query strings like `?v=2026-01-20`.
      {
        pathname: "/fonts/slides/**",
      },
      // Allow character avatar images (character1 through character7).
      {
        pathname: "/fonts/character1/**",
      },
      {
        pathname: "/fonts/character2/**",
      },
      {
        pathname: "/fonts/character3/**",
      },
      {
        pathname: "/fonts/character4/**",
      },
      {
        pathname: "/fonts/character5/**",
      },
      {
        pathname: "/fonts/character6/**",
      },
      {
        pathname: "/fonts/character7/**",
      },
      {
        pathname: "/fonts/character8/**",
      },
      {
        pathname: "/fonts/character9/**",
      },
    ],
  },
};

export default nextConfig;
