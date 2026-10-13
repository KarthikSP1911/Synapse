import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // MindSprint and Number Recall used to live at the top level; keep bookmarks and installed shortcuts working.
    return [
      { source: "/mindsprint", destination: "/games/mindsprint", permanent: true },
      { source: "/recall", destination: "/games/recall", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        // The service worker must always be re-fetched so a new deploy can replace the old one.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
