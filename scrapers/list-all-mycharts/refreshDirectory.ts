/**
 * Epic's directory with every login URL checked: what `mychart-cli --action
 * list-mycharts` prints, and what `fetch-mychart-instances.ts` writes to the
 * bundled `mychart-instances.json` on each MCPB release.
 *
 * A crawl of all ~1,400 organizations — minutes, not seconds — so it is never
 * run on a search; searches apply the corrections a refresh recorded.
 */

import { fetchMyChartDirectory, type MyChartInstance } from './directory';
import { resolveLoginUrl, type LoginUrlResolution } from './resolveLoginUrl';

/** Organizations resolved at once. `scraperFetch` still caps each host at ten. */
const CONCURRENCY = 24;

type Unconfirmed = Extract<LoginUrlResolution, { kind: 'down' | 'unconfirmed' }>;

export interface ResolvedDirectory {
  instances: MyChartInstance[];
  /** Organizations whose `url` now differs from Epic's `loginUrl`. */
  corrected: number;
  /**
   * Organizations whose login could be confirmed neither way. Each keeps the
   * URL it had — the last correction while Epic's URL is unchanged, Epic's own
   * otherwise — and the `down` ones are marked so.
   */
  unconfirmed: { instance: MyChartInstance; resolution: Unconfirmed }[];
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
): Promise<ResolvedDirectory> {
  const instances = await fetchMyChartDirectory();
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

  const unconfirmed: ResolvedDirectory['unconfirmed'] = [];
  for (const instance of instances) {
    const resolution = outcomes.get(instance)!;
    if (resolution.kind === 'login') instance.url = instance.directoryUrl;
    else if (resolution.kind === 'linked') instance.url = resolution.url;
    else {
      if (resolution.kind === 'down') instance.down = true;
      unconfirmed.push({ instance, resolution });
    }
  }

  return {
    instances,
    corrected: instances.filter((i) => i.url !== i.directoryUrl).length,
    unconfirmed,
  };
}
