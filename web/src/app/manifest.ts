import type { MetadataRoute } from "next";
import { resolveSiteUrl } from "@/lib/site-url";

// Served by Next.js at /manifest.webmanifest and linked automatically from
// every page. Keep in sync with openrecord-splash/manifest.json, which does
// the same job for the static marketing site.
export const dynamic = "force-dynamic";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OpenRecord — Manage your Health Data with AI",
    short_name: "OpenRecord",
    description:
      "Connect your MyChart portal to Claude AI. Manage health records, send messages, book appointments, request refills, and more — all with AI.",
    start_url: `${resolveSiteUrl()}/home`,
    scope: "/",
    display: "standalone",
    background_color: "#f7f9fc",
    theme_color: "#f7f9fc",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any", purpose: "any" },
      { src: "/icon-192.png", type: "image/png", sizes: "192x192", purpose: "any" },
      { src: "/icon-512.png", type: "image/png", sizes: "512x512", purpose: "any" },
      { src: "/icon-512.png", type: "image/png", sizes: "512x512", purpose: "maskable" },
    ],
  };
}
