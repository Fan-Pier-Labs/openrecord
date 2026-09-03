#!/usr/bin/env bun
/**
 * Regenerate `docs/processor-layer-examples.md`: every read capability run
 * against fake-mychart in all four output modes, so the examples in the docs
 * are real output rather than hand-typed guesses.
 *
 * Needs a fake-mychart on localhost:4000 (or FAKE_MYCHART_HOST):
 *
 *   cd fake-mychart && PORT=4000 bun run dev
 *   bun dev-scripts/generate-processor-examples.ts
 *
 * Signs in as Homer Simpson — fake data only. Nothing here ever touches a real
 * instance.
 */

import { writeFileSync } from 'fs';
import { join } from 'path';

import { myChartUserPassLogin } from '../scrapers/myChart/auth/login';
import type { MyChartRequest } from '../scrapers/myChart/core/myChartRequest';
import { OUTPUT_MODES, type OutputMode } from '../scrapers/myChart/processors/processor';
import { CAPABILITIES, acceptsModeParam, executeCapability, isPublicCapability } from '../shared/capabilities';

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000';

/** Above this, a raw or json example is cut and the cut is said out loud. */
const MAX_EXAMPLE_CHARS = 12_000;

type ArgSupplier = (session: MyChartRequest) => Promise<Record<string, unknown>>;

/** Arguments for the capabilities that need one, taken from live data like the integration test does. */
const ARGS: Record<string, ArgSupplier> = {
  get_visit_notes: async (s) => ({ csn: await firstVisitCsn(s) }),
  get_visit_avs: async (s) => ({ csn: await firstVisitCsn(s) }),
  get_note_content: async (s) => {
    const csn = await firstVisitCsn(s);
    const notes = (await executeCapability(s, 'get_visit_notes', { csn, mode: 'json' })) as {
      lrpID: string;
      noteList: Array<{ hnoID: string; hnoDAT: string }>;
    };
    const note = notes.noteList[0]!;
    return { csn, lrp_id: notes.lrpID, hno_id: note.hnoID, hno_dat: note.hnoDAT };
  },
  get_message_thread: async (s) => {
    const inbox = (await executeCapability(s, 'get_messages', { mode: 'json' })) as {
      conversations: Array<{ hthId: string }>;
    };
    return { conversation_id: inbox.conversations[0]!.hthId };
  },
  get_letter_details: async (s) => {
    const letters = (await executeCapability(s, 'get_letters', { mode: 'json' })) as {
      letters: Array<{ hnoId: string; csn: string }>;
    };
    return { hno_id: letters.letters[0]!.hnoId, csn: letters.letters[0]!.csn };
  },
};

async function firstVisitCsn(session: MyChartRequest): Promise<string> {
  const past = (await executeCapability(session, 'get_past_visits', { mode: 'json' })) as {
    visits: Array<{ Csn: string | null }>;
  };
  const csn = past.visits.find((v) => v.Csn)?.Csn;
  if (!csn) throw new Error('fake-mychart returned no past visit with a CSN');
  return csn;
}

function fence(language: string, body: string): string {
  return `\`\`\`${language}\n${body}\n\`\`\``;
}

function clipped(text: string): string {
  if (text.length <= MAX_EXAMPLE_CHARS) return text;
  return `${text.slice(0, MAX_EXAMPLE_CHARS)}\n… (truncated; ${text.length - MAX_EXAMPLE_CHARS} more characters)`;
}

function renderExample(payload: unknown): string {
  if (typeof payload === 'string') {
    // Markdown modes render as markdown, so the example reads the way a
    // client sees it. Indented one level under the <details> so headings in
    // the example stay inside the fold.
    return payload.trim();
  }
  return fence('json', clipped(JSON.stringify(payload, null, 2)));
}

/**
 * Two things in the raw records change on every run, and both are the fake's
 * doing rather than the processors': the per-session CSRF token the fake mints,
 * and the now-based `oldestRenderedDate` the visits scraper puts in its query.
 * Pin both to same-length constants so the doc only changes when the output
 * does (CI regenerates it and fails on a diff). Same length keeps the sizes
 * table honest.
 */
function stable(doc: string): string {
  return doc
    .replace(/fake-csrf-token-[0-9a-f]{32}/g, `fake-csrf-token-${'0'.repeat(32)}`)
    .replace(/oldestRenderedDate=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, 'oldestRenderedDate=2024-01-01T00:00:00.000Z');
}

function sizeOf(payload: unknown): number {
  return typeof payload === 'string' ? payload.length : JSON.stringify(payload).length;
}

async function main(): Promise<void> {
  const login = await myChartUserPassLogin({ hostname: HOST, user: 'homer', pass: 'donuts123', protocol: 'http' });
  if (login.state !== 'logged_in') throw new Error(`fake-mychart login failed: ${login.state}`);
  const session = login.mychartRequest;

  // Every read that this server can answer. The `public` capabilities have
  // processors too, but they read CMS's NPI Registry rather than a MyChart —
  // and hard-code its URL, so there is no way to point one at the fake. Their
  // per-field contract is in `scrapers/npi/README.md`; running them here would
  // mean querying the real registry from a docs script.
  const reads = CAPABILITIES.filter((c) => acceptsModeParam(c) && !isPublicCapability(c));
  const sections: string[] = [];
  const sizes: string[] = ['| Capability | raw | json | standard | concise |', '| --- | ---: | ---: | ---: | ---: |'];

  for (const capability of reads) {
    const args = ARGS[capability.id] ? await ARGS[capability.id]!(session) : {};
    const outputs: Partial<Record<OutputMode, unknown>> = {};
    for (const mode of OUTPUT_MODES) {
      outputs[mode] = await executeCapability(session, capability.id, { ...args, mode });
    }
    sizes.push(
      `| \`${capability.id}\` | ${sizeOf(outputs.raw)} | ${sizeOf(outputs.json)} | ${sizeOf(outputs.standard)} | ${sizeOf(outputs.concise)} |`,
    );

    const argLine = Object.keys(args).length
      ? `\nArguments: ${fence('json', JSON.stringify(args))}\n`
      : '';
    const blocks = OUTPUT_MODES.map(
      (mode) =>
        `<details>\n<summary><code>mode: ${mode}</code> (${sizeOf(outputs[mode])} chars)</summary>\n\n${renderExample(outputs[mode])}\n\n</details>`,
    );
    sections.push(`### \`${capability.id}\`\n\n${capability.description}\n${argLine}\n${blocks.join('\n\n')}`);
  }

  const doc = [
    '# Processor layer: example output per capability',
    '',
    '**Generated** by `bun dev-scripts/generate-processor-examples.ts` against fake-mychart',
    "(Homer Simpson's chart — fake data, nothing real). Do not edit by hand; re-run the script",
    'after changing a processor. Field decisions are in',
    '[`processor-layer-proposal.md`](processor-layer-proposal.md).',
    '',
    `Every read capability this server can answer, in all four modes. Raw and JSON examples longer`,
    `than ${MAX_EXAMPLE_CHARS.toLocaleString()} characters are cut, and say so. The fake's per-session CSRF token and the`,
    'now-based `oldestRenderedDate` query value are pinned so the doc only changes when the output',
    'does. The `public` capabilities are absent: they read CMS\'s NPI Registry rather than a MyChart,',
    'so this script has nothing to run them against — see [`scrapers/npi/README.md`](../scrapers/npi/README.md).',
    '',
    '## Sizes (characters)',
    '',
    ...sizes,
    '',
    '## Examples',
    '',
    sections.join('\n\n---\n\n'),
    '',
  ].join('\n');

  const out = join(import.meta.dir, '..', 'docs', 'processor-layer-examples.md');
  writeFileSync(out, stable(doc));
  console.log(`wrote ${out} (${reads.length} capabilities)`);
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
