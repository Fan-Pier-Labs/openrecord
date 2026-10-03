/**
 * Epic's directory with every login URL checked — the deterministic code
 * behind `mychart-instances.json`. It writes that file on each MCPB release
 * (`fetch-mychart-instances.ts`), reruns weekly in the long-running clients
 * (`refreshMyChartDirectory`), and is what `mychart-cli --action
 * list-mycharts` prints.
 *
 * A crawl of all ~1,400 organizations — minutes, not seconds — so it never
 * runs inside a search; a search reads the last run's result.
 */

import { fetchMyChartDirectory, mergeDuplicates, type MyChartInstance } from './directory';
import { resolveLoginUrl, type LoginUrlResolution } from './resolveLoginUrl';

/** Organizations resolved at once. `scraperFetch` still caps each host at ten. */
const CONCURRENCY = 24;

export interface ResolvedDirectory {
  instances: MyChartInstance[];
  /** Organizations whose `url` now differs from Epic's `loginUrl`. */
  corrected: number;
  /** Organizations we couldn't confirm were up, twice. They keep Epic's URL, marked `down`. */
  down: { instance: MyChartInstance; reason: string }[];
}

async function resolveAll(
  instances: MyChartInstance[],
  onResolved: (instance: MyChartInstance, resolution: LoginUrlResolution) => void,
): Promise<void> {
  const queue = [...instances];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let instance = queue.shift(); instance; instance = queue.shift()) {
        onResolved(instance, await resolveLoginUrl(instance.directoryUrl));
      }
    }),
  );
}

export async function fetchResolvedMyChartDirectory(
  onProgress?: (done: number, total: number) => void,
  directory: { directoryUrl?: string; mediaBase?: string } = {},
): Promise<ResolvedDirectory> {
  const instances = await fetchMyChartDirectory(directory);
  const outcomes = new Map<MyChartInstance, LoginUrlResolution>();
  await resolveAll(instances, (instance, resolution) => {
    outcomes.set(instance, resolution);
    onProgress?.(outcomes.size, instances.length);
  });

  // A blip during a release would otherwise mark a portal down for as long as
  // that release is installed, so everything that looked down gets a second
  // try once the crawl has finished.
  const looksDown = instances.filter((i) => outcomes.get(i)?.kind === 'down');
  await resolveAll(looksDown, (instance, resolution) => outcomes.set(instance, resolution));

  const down: ResolvedDirectory['down'] = [];
  for (const instance of instances) {
    const resolution = outcomes.get(instance)!;
    if (resolution.kind === 'linked') instance.url = resolution.url;
    else if (resolution.kind === 'down') {
      instance.down = true;
      down.push({ instance, reason: resolution.reason });
    }
  }

  // Again after resolving: two entries can share a portal only once corrected.
  const merged = mergeDuplicates(instances);
  return {
    instances: merged,
    corrected: merged.filter((i) => i.url !== i.directoryUrl).length,
    down,
  };
}
