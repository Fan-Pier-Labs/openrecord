/**
 * Refreshes the checked-in `mychart-instances.json` from Epic's live directory,
 * with every login URL checked (`fetchResolvedMyChartDirectory`).
 *
 * The file is the offline seed: it is what the mobile app shows on a first
 * launch with no network, what the Claude Desktop extension bundles, and what
 * `probes/probe-mount-discovery.ts` iterates. The MCPB's `pack:signed` runs
 * this first, so each release ships a fresh one — commit the result. The
 * long-running clients rerun the same refresh monthly.
 *
 * Logos are not downloaded or mirrored. This used to copy all ~1400 of them
 * into a private S3 bucket that no client could read — they run on other
 * people's machines with none of our credentials — so every one of them was
 * already loading logos straight from Epic. See `fetchMyChartIcon`.
 *
 * Usage:
 *   bun scrapers/list-all-mycharts/fetch-mychart-instances.ts [--dry-run]
 */

import * as fs from 'fs';
import * as path from 'path';
import { silenceLogger } from '../../shared/logger';
import { toSeedEntry, toSortedJson, type MyChartInstanceSeed } from './directory';
import { fetchResolvedMyChartDirectory } from './refreshDirectory';

const OUTPUT_FILE = path.join(path.dirname(import.meta.path), 'mychart-instances.json');

async function main() {
  const dryRun = process.argv.slice(2).includes('--dry-run');
  // Every request logs a line, and ~5,000 of them bury the summary below.
  silenceLogger();

  const { instances, corrected, down } = await fetchResolvedMyChartDirectory((done, total) => {
    if (done % 100 === 0 || done === total) console.log(`Checked ${done}/${total} login URLs`);
  });

  const next = instances.map(toSeedEntry);

  const previous = new Map(
    (JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8')) as MyChartInstanceSeed[]).map((e) => [e.slgId, e]),
  );
  const moved = next.filter((e) => previous.has(e.slgId) && previous.get(e.slgId)!.url !== e.url);

  console.log(`${next.length} instances (was ${previous.size}): ${corrected} login URLs corrected, ${down.length} down`);
  for (const e of moved) console.log(`  url changed  ${e.slgId}  ${e.name}: ${previous.get(e.slgId)!.url} → ${e.url}`);
  for (const { instance, reason } of down) console.log(`  down  ${instance.slgId}  ${instance.name}: ${reason}`);

  if (!dryRun) {
    // Sorted so a refresh produces a reviewable diff: Epic's own order drifts.
    fs.writeFileSync(OUTPUT_FILE, toSortedJson(next));
    console.log(`Wrote ${next.length} instances to ${OUTPUT_FILE}`);
  }
}

// Exit as soon as the file is written: a resolution abandoned at its timeout
// can still be mid-request for minutes, and `pack:signed` waits on this.
main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
