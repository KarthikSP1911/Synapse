import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Synapse · Mental maths practice",
    short_name: "Synapse",
    description: "Build mental-maths speed with adaptive practice in multiplication, percentages, fractions and squares.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    // Android colours the installed app's system navigation bar from these, and a manifest cannot switch
    // by colour scheme, so they match dark mode. The page's own theme-color meta still follows the scheme.
    background_color: "#000000",
    theme_color: "#000000",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/brand/synapse-logo.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
    shortcuts: [
      { name: "Practice", url: "/", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Progress", url: "/progress", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Times tables", url: "/tables", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
