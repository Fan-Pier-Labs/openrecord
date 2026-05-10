import bundledInstances from "../../../scrapers/list-all-mycharts/mychart-instances.json";

export type MyChartInstance = {
  name: string;
  url: string;
  logoUrl: string;
  logoS3Key: string;
  logoS3Url: string;
};

// Demo/test entry pointing at the deployed fake-mychart sandbox. Lets
// users (and developers) try the full flow with Homer Simpson fake data
// without needing real Epic credentials.
const FAKE_MYCHART_DEMO: MyChartInstance = {
  name: "Springfield Medical Center (Demo)",
  url: "https://fake-mychart.fanpierlabs.com/MyChart/",
  logoUrl: "",
  logoS3Key: "",
  logoS3Url: "",
};

let cached: MyChartInstance[] | null = null;

/**
 * Get the full list of MyChart instances (~1800 items).
 * Currently bundled at app build time. The list is also fetched at app
 * startup (see prefetchInstances) so logos warm in the image cache.
 */
export function getInstances(): MyChartInstance[] {
  if (cached) return cached;
  const list = bundledInstances as MyChartInstance[];
  cached = [FAKE_MYCHART_DEMO, ...list];
  return cached;
}

/**
 * Pre-warm the bundled list and ping the first batch of logo URLs so
 * iOS pre-fetches them into NSURLCache. Call once at app startup.
 */
export async function prefetchInstances(): Promise<void> {
  const instances = getInstances();
  // Prefetch the first ~50 logos so the picker initial paint is instant.
  const head = instances.slice(0, 50);
  await Promise.all(
    head.map((i) =>
      i.logoUrl
        ? fetch(i.logoUrl, { method: "HEAD" }).catch(() => undefined)
        : undefined,
    ),
  );
}

/**
 * Extract the host (incl. port if non-default) from a MyChart instance URL
 * so the scraper can use it. Using `.host` instead of `.hostname` preserves
 * non-standard ports like the dev fake-mychart at localhost:4001.
 * The scraper auto-discovers `firstPathPart` via redirects.
 */
export function hostnameFromInstance(instance: MyChartInstance): string {
  try {
    return new URL(instance.url).host;
  } catch {
    return instance.url.replace(/^https?:\/\//, "").split("/")[0];
  }
}

/**
 * Case-insensitive substring match against name and hostname.
 */
export function searchInstances(
  query: string,
  instances: MyChartInstance[] = getInstances(),
): MyChartInstance[] {
  const q = query.trim().toLowerCase();
  if (!q) return instances;
  return instances.filter((i) => {
    if (i.name.toLowerCase().includes(q)) return true;
    try {
      return new URL(i.url).host.toLowerCase().includes(q);
    } catch {
      return false;
    }
  });
}
