/**
 * `--help` and `--help --show-all`.
 *
 * MyChart's surface is not evenly valuable, and the CLI's help is read as often
 * by a model choosing a tool as by a person. So the default text leads with the
 * capabilities worth reaching for and holds the rest behind `--show-all` —
 * without ever making a hidden capability unreachable, which is what these
 * assertions pin down.
 */

import { describe, it, expect } from 'bun:test';

import {
  CAPABILITIES,
  COMMON_CAPABILITIES,
  LESS_FREQUENTLY_USED_CAPABILITIES,
  getCapability,
} from '../../../shared/capabilities';
import { renderCapabilityList } from '../capabilityActions';
import { renderCliHelp } from '../help';

describe('renderCliHelp', () => {
  it('shows every commonly-used capability by default', () => {
    const help = renderCliHelp();
    for (const capability of COMMON_CAPABILITIES) {
      expect(help).toContain(capability.id);
    }
  });

  it('leaves the less-frequently-used ones out by default', () => {
    const help = renderCliHelp();
    for (const capability of LESS_FREQUENTLY_USED_CAPABILITIES) {
      expect(help).not.toContain(capability.id);
    }
  });

  it('names the flag that reveals the rest, and says how many there are', () => {
    const help = renderCliHelp();
    expect(help).toContain('--show-all');
    expect(help).toContain(`${LESS_FREQUENTLY_USED_CAPABILITIES.length} less-frequently-used`);
  });

  it('shows the whole registry under --show-all', () => {
    const help = renderCliHelp({ showAll: true });
    for (const capability of CAPABILITIES) {
      expect(help).toContain(capability.id);
    }
    expect(help).toContain('Less frequently used');
  });

  it('stops telling the reader about --show-all once they have used it', () => {
    expect(renderCliHelp({ showAll: true })).not.toContain('are hidden. Show them with');
  });

  it('documents every flag the CLI actually parses', async () => {
    // Read the flags out of `cli.ts` itself rather than listing them here — a
    // hand-kept list in a test is the same thing the capability registry
    // exists to abolish. `--output` was added to the CLI while this help text
    // was in flight and went undocumented; this is what catches the next one.
    const source = await Bun.file(new URL('../cli.ts', import.meta.url).pathname).text();
    const parsed = new Set(
      // `m[1]!`: the pattern's one group always participates in a match, so
      // this is a Set<string> — which is also what lets the sort below stay
      // comparator-free.
      [...source.matchAll(/args\[i\] === '(--[a-z-]+)'/g)].map((m) => m[1]!),
    );
    expect(parsed.size).toBeGreaterThan(20);

    const help = renderCliHelp();
    const undocumented = [...parsed].filter((flag) => !help.includes(flag)).sort();
    expect(undocumented).toEqual([]);
  });

  it('carries the capability listing rather than a second copy of it', () => {
    // Two renderers drifting apart is exactly the failure the registry exists
    // to prevent, so `--help` embeds the listing verbatim.
    expect(renderCliHelp()).toContain(renderCapabilityList());
    expect(renderCliHelp({ showAll: true })).toContain(renderCapabilityList({ showAll: true }));
  });
});

describe('less-frequently-used capabilities', () => {
  it('are hidden from the default listing, never disabled', () => {
    // The flag is presentation only. Every hidden id still resolves as an
    // `--action`, with the same parameters it always had.
    for (const capability of LESS_FREQUENTLY_USED_CAPABILITIES) {
      expect(getCapability(capability.id)?.id).toBe(capability.id);
    }
  });

  it('partition the registry — every capability is in exactly one bucket', () => {
    expect(COMMON_CAPABILITIES.length + LESS_FREQUENTLY_USED_CAPABILITIES.length).toBe(CAPABILITIES.length);
    const common = new Set(COMMON_CAPABILITIES.map((c) => c.id));
    for (const capability of LESS_FREQUENTLY_USED_CAPABILITIES) {
      expect(common.has(capability.id)).toBe(false);
    }
  });

  it('leave the capabilities a chart is actually read for in the common set', () => {
    // A guard against the hidden set quietly growing to swallow the point of
    // the product: whatever else moves, these stay in the default help.
    const common = new Set(COMMON_CAPABILITIES.map((c) => c.id));
    for (const id of [
      'get_medications',
      'get_allergies',
      'get_lab_results',
      'get_imaging_results',
      'get_visit_notes',
      'get_past_visits',
      'get_messages',
      'send_message',
      'request_refill',
      'list_proxy_targets',
    ]) {
      expect(common.has(id)).toBe(true);
    }
  });
});
