/**
 * Refreshes the checked-in `mychart-instances.json` from Epic's live directory,
 * with every login URL checked (`fetchResolvedMyChartDirectory`).
 *
 * The file is the offline seed: it is what the mobile app shows on a first
 * launch with no network, what the Claude Desktop extension bundles, and what
 * `probes/probe-mount-discovery.ts` iterates. It is also where login-URL
 * corrections are recorded, which every client applies to the live directory
 * too. The MCPB's `pack:signed` runs this first, so each release ships a fresh
 * one — commit the result.
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
import { toSeedEntry, type MyChartInstance, type MyChartInstanceSeed } from './directory';
import manualEntries from './mychart-instances-manual.json';
import { fetchResolvedMyChartDirectory } from './refreshDirectory';
import { resolveLoginUrl } from './resolveLoginUrl';

const OUTPUT_FILE = path.join(path.dirname(import.meta.path), 'mychart-instances.json');

async function main() {
  const dryRun = process.argv.slice(2).includes('--dry-run');
  // Every request logs a line, and ~5,000 of them bury the summary below.
  silenceLogger();

  const { instances, corrected, unconfirmed } = await fetchResolvedMyChartDirectory((done, total) => {
    if (done % 100 === 0 || done === total) console.log(`Checked ${done}/${total} login URLs`);
  });

  // Sorted by name so a refresh produces a reviewable diff — Epic's own
  // ordering drifts, and an unsorted rewrite reads as "everything changed".
  instances.sort((a, b) => a.name.localeCompare(b.name) || a.slgId.localeCompare(b.slgId));
  const next = instances.map(toSeedEntry);

  const previous = new Map(
    (JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8')) as MyChartInstanceSeed[]).map((e) => [e.slgId, e]),
  );
  const moved = next.filter((e) => previous.has(e.slgId) && previous.get(e.slgId)!.url !== e.url);
  const down = unconfirmed.filter((u) => u.resolution.kind === 'down');

  console.log(
    `${next.length} instances (was ${previous.size}): ${corrected} login URLs corrected, ` +
      `${down.length} down, ${unconfirmed.length - down.length} unconfirmed (custom sign-in, bot wall, or no answer from here)`,
  );
  for (const e of moved) console.log(`  url changed  ${e.slgId}  ${e.name}: ${previous.get(e.slgId)!.url} → ${e.url}`);
  for (const { instance, resolution } of down) console.log(`  down  ${instance.slgId}  ${instance.name}: ${resolution.reason}`);

  if (!dryRun) {
    fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`Wrote ${next.length} instances to ${OUTPUT_FILE}`);
  }
  await checkManualEntries(instances);
}

/**
 * The hand-kept entries are only as good as the last time someone looked, so
 * every refresh looks again and says what needs a human: a portal that no
 * longer serves a login, a correction Epic's new URL has made moot, an
 * addition Epic now lists itself. Warnings, not failures — a release is not
 * the moment to research a hospital's website.
 */
async function checkManualEntries(epic: MyChartInstance[]): Promise<void> {
  const bySlgId = new Map(epic.map((i) => [i.slgId, i]));
  const epicHosts = new Set(epic.map((i) => new URL(i.directoryUrl).hostname.toLowerCase()));
  const warnings: string[] = [];

  for (const c of manualEntries.corrections) {
    const now = bySlgId.get(c.slgId)?.directoryUrl;
    if (now !== c.directoryUrl) warnings.push(`correction ${c.slgId} ${c.name} lapsed: Epic now publishes ${now ?? 'nothing'}`);
  }
  for (const a of manualEntries.additions) {
    if (epicHosts.has(new URL(a.url).hostname.toLowerCase())) warnings.push(`addition ${a.slgId} ${a.name}: Epic now lists ${a.url}`);
  }
  const urls = [...new Set([...manualEntries.corrections, ...manualEntries.additions].map((e) => e.url))];
  const results = await Promise.all(urls.map(async (url) => [url, await resolveLoginUrl(url)] as const));
  for (const [url, result] of results) {
    if (result.kind !== 'login') warnings.push(`${url} no longer serves a MyChart login (${result.kind}${'reason' in result ? `: ${result.reason}` : ''})`);
  }

  console.log(`Hand entries (mychart-instances-manual.json): ${warnings.length ? `${warnings.length} need a look` : 'all still good'}`);
  for (const w of warnings) console.log(`  ${w}`);
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
