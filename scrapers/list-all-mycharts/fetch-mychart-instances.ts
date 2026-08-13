/**
 * Refreshes the checked-in `mychart-instances.json` from Epic's live directory.
 *
 * The file is the offline seed: it is what the mobile app shows on a first
 * launch with no network, what the Claude Desktop extension bundles, and what
 * `probe-mount-discovery.ts` iterates. Clients that can reach the network
 * refresh themselves from {@link fetchMyChartDirectory} — this script only
 * exists so the seed doesn't rot.
 *
 * Logos are not downloaded or mirrored. They used to be copied into
 * `s3://mychart-connector/mychart-logos/`, which no client could read (the
 * bucket is private and the clients run on other people's machines), so every
 * one of them was already loading logos from Epic. See `fetchMyChartIcon`.
 *
 * Usage:
 *   bun scrapers/list-all-mycharts/fetch-mychart-instances.ts [--dry-run]
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../shared/logger';
import { fetchMyChartDirectory, toSeedEntry } from './directory';

const OUTPUT_FILE = path.join(path.dirname(import.meta.path), 'mychart-instances.json');

async function main() {
  const dryRun = process.argv.slice(2).includes('--dry-run');

  const instances = await fetchMyChartDirectory();
  logger.debug(`Fetched ${instances.length} MyChart instances`);

  // Sorted by name so a refresh produces a reviewable diff — Epic's own
  // ordering drifts, and an unsorted rewrite reads as "everything changed".
  instances.sort((a, b) => a.name.localeCompare(b.name) || a.slgId.localeCompare(b.slgId));

  if (dryRun) {
    const previous = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8')) as { name: string }[];
    logger.debug(`Would write ${instances.length} instances (currently ${previous.length})`);
    return;
  }

  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(instances.map(toSeedEntry), null, 2)}\n`);
  logger.debug(`Wrote ${instances.length} instances to ${OUTPUT_FILE}`);
}

main().catch((err: unknown) => {
  logger.error(err);
  process.exit(1);
});
