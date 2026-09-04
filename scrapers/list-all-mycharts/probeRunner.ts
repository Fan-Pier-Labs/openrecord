/**
 * The bits every probe script repeats: argument parsing, a bounded worker
 * pool, JSONL output and progress.
 *
 * Three probes now sweep the directory — mount discovery, open scheduling, and
 * the slot search — and each had its own copy of this loop. The probe-specific
 * part is one function from a host entry to a result; everything else is here.
 */

import * as fs from 'fs';
import * as path from 'path';
import { groupByHost, type HostEntry } from './probe-mount-discovery';
import { setLogSink, silenceLogger } from '../../shared/logger';

const INSTANCES_FILE = path.join(path.dirname(import.meta.path), 'mychart-instances.json');

export type ProbeArgs = {
  entries: HostEntry[];
  concurrency: number;
  outFile: string | undefined;
};

/**
 * Read `--hosts`, `--limit`, `--concurrency` and `--out` and resolve the host
 * list. Silences the logger unless `--verbose`, since discovery is chatty.
 */
export function parseProbeArgs(argv: string[]): ProbeArgs {
  const flag = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  if (argv.includes('--verbose')) setLogSink((level, args) => console.error(`[${level}]`, ...args));
  else silenceLogger();

  const instances: { name: string; url: string }[] = JSON.parse(fs.readFileSync(INSTANCES_FILE, 'utf-8'));
  let entries = groupByHost(instances);

  const onlyHosts = flag('--hosts')?.split(',').map((h) => h.trim()).filter(Boolean);
  if (onlyHosts) {
    const wanted = new Set(onlyHosts);
    entries = entries.filter((e) => wanted.has(e.host));
  }
  const limit = Number(flag('--limit') ?? 0);
  if (limit) entries = entries.slice(0, limit);

  return { entries, concurrency: Number(flag('--concurrency') ?? 16), outFile: flag('--out') };
}

/**
 * Run `probe` over every entry with at most `concurrency` in flight, writing
 * one JSON object per line as results arrive so a long sweep is resumable from
 * whatever it managed before it was interrupted.
 */
export async function runProbe<T>(
  args: ProbeArgs,
  probe: (entry: HostEntry) => Promise<T>,
  label = 'hosts',
): Promise<T[]> {
  const { entries, concurrency, outFile } = args;
  console.error(`Probing ${entries.length} ${label} (concurrency ${concurrency})…`);

  const out = outFile ? fs.createWriteStream(outFile, { flags: 'a' }) : null;
  const results: T[] = [];
  const queue = [...entries];
  let done = 0;

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (queue.length) {
        const entry = queue.shift();
        if (!entry) break;
        const result = await probe(entry);
        results.push(result);
        out?.write(JSON.stringify(result) + '\n');
        if (++done % 25 === 0) console.error(`  ${done}/${entries.length}`);
      }
    }),
  );
  out?.end();
  if (outFile) console.error(`\nFull results: ${outFile}`);
  return results;
}
