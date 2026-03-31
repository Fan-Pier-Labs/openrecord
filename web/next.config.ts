import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import path from "path";

// Parse allowed dev origins from BETTER_AUTH_URL env var (e.g. https://example.ngrok-free.dev -> example.ngrok-free.dev)
const devOrigins: string[] = [];
const authUrl = process.env.BETTER_AUTH_URL;
if (authUrl) {
  try {
    devOrigins.push(new URL(authUrl).hostname);
  } catch { /* ignore invalid URLs */ }
}

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, ".."),
  ...(devOrigins.length > 0 ? { allowedDevOrigins: devOrigins } : {}),
  typescript: {
    // Type checking runs separately in CI; skip during Docker build to avoid OOM
    ignoreBuildErrors: true,
  },
  // Scrapers live outside web/ and import packages from root node_modules.
  // Tell Next.js to resolve these as external server packages so Turbopack
  // doesn't fail when it can't find them in web/node_modules.
  serverExternalPackages: ["cheerio", "tough-cookie", "fetch-cookie"],

  // Redirect old domain to canonical domain (preserves path)
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'mychart.fanpierlabs.com' }],
        destination: 'https://openrecord.fanpierlabs.com/:path*',
        permanent: true,
      },
    ];
  },
};

// Only enable Sentry build-time integration when SENTRY_DSN is configured.
// Self-hosters who don't set SENTRY_DSN get a plain Next.js build with no
// Sentry overhead, source-map uploads, or tunnel routes.
export default process.env.SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG ?? "fan-pier-labs",
      project: process.env.SENTRY_PROJECT ?? "openrecord",

      // Only print logs for uploading source maps in CI
      silent: !process.env.CI,

      // Upload a larger set of source maps for prettier stack traces (increases build time)
      widenClientFileUpload: true,

      // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
      tunnelRoute: "/monitoring",

      webpack: {
        automaticVercelMonitors: true,
        treeshake: {
          removeDebugLogging: true,
        },
      },
    })
  : nextConfig;
