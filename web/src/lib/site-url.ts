/**
 * Resolves the public origin this deployment is reachable at.
 *
 * Used for `metadata.metadataBase` (which turns relative og:image paths into
 * the absolute URLs that iMessage, Slack, and Twitter/X require — they will
 * not resolve a relative path) and for the web app manifest's `start_url`.
 *
 * Deployment modes, in precedence order:
 *   1. NEXT_PUBLIC_SITE_URL   — explicit override, wins everywhere
 *   2. BETTER_AUTH_URL        — already set for custom-domain deployments
 *   3. NEXT_PUBLIC_BASE_URL   — legacy alias, same meaning
 *   4. RAILWAY_PUBLIC_DOMAIN  — hostname only, Railway reference variable
 *   5. production default     — AWS Fargate sets none of the above
 *   6. http://localhost:PORT  — dev
 */

/** Public domain configured in `web/deploy.yaml` for the Fargate deployment. */
export const DEFAULT_PRODUCTION_SITE_URL = "https://openrecord.fanpierlabs.com";

/** Adds a scheme if the value is a bare hostname (Railway gives one). */
function withScheme(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function resolveSiteUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const candidates = [
    env.NEXT_PUBLIC_SITE_URL,
    env.BETTER_AUTH_URL,
    env.NEXT_PUBLIC_BASE_URL,
    env.RAILWAY_PUBLIC_DOMAIN,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = withScheme(candidate);
    if (!normalized) continue;
    // Ignore anything that isn't a parseable absolute URL rather than letting
    // `new URL()` throw inside Next's metadata resolution and blank the page.
    // `new URL()` also does the origin extraction: paths, query strings, and
    // trailing slashes all fall away.
    try {
      const { origin, hostname } = new URL(normalized);
      if (hostname) return origin;
    } catch {
      continue;
    }
  }

  if (env.NODE_ENV === "production") return DEFAULT_PRODUCTION_SITE_URL;
  return `http://localhost:${env.PORT || 3000}`;
}
