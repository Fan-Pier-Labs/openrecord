/**
 * The demo's tool surface, held to the shared capability registry.
 *
 * [`docs/demo.md`](../../docs/demo.md) sets the rule: "the tool set, the
 * write-confirmation set, and the account/patient model are held to
 * `shared/capabilities.ts`", and everything not on its accepted-divergences
 * list is drift. Until this file existed nothing enforced that — the demo
 * shares no code with the scraper core, so the only thing keeping the two
 * surfaces together was someone noticing. They had already come apart in four
 * places at once.
 *
 * The demo still shares no *product* code with the core. This is a test
 * reaching across to compare two lists, which is the one place the coupling
 * costs nothing and buys the guarantee.
 *
 * The two allowlists below are the accepted divergences, and they are checked
 * for rot in both directions: an id that stops existing on the side it is
 * excused from fails here rather than quietly covering nothing.
 */

import { describe, expect, test } from 'bun:test';
import { CAPABILITIES } from '../../shared/capabilities';
import { TOOL_SPECS } from '../demo/src/tools';

/**
 * Registry capabilities the demo deliberately does not carry.
 *
 * `download_imaging_study` is the imaging divergence documented in
 * docs/demo.md: the demo's radiograph is drawn procedurally by
 * `components/Radiograph.tsx` rather than decoded from the eUnity protocol, and
 * `get_xray_image` is the tool that returns it.
 */
const ACCEPTED_MISSING_FROM_DEMO = new Set(['download_imaging_study']);

/**
 * Demo tools with no registry entry.
 *
 * The first four are client-level session plumbing — the Claude Desktop
 * extension hand-registers its own equivalents rather than deriving them from
 * the registry, and the demo does the same. They are also excluded from the
 * model's tool list (group `Account`).
 *
 * `get_xray_image` is the other half of the imaging divergence above.
 *
 * `get_available_appointments` and `book_appointment` are scheduling, which the
 * product does not do at all. Kept deliberately — see docs/demo.md.
 */
const ACCEPTED_DEMO_ONLY = new Set([
  'list_accounts',
  'connect_instance',
  'check_session',
  'complete_2fa',
  'get_xray_image',
  'get_available_appointments',
  'book_appointment',
]);

const demoByName = new Map(TOOL_SPECS.map((spec) => [spec.name, spec]));

/**
 * The capabilities a client is expected to offer a model.
 *
 * `account` kind changes how the patient signs in, so no client hands it to a
 * model; `comingSoon` is declared but not implemented anywhere yet.
 */
const AGENT_FACING = CAPABILITIES.filter((c) => c.kind !== 'account' && !c.comingSoon);

describe('the demo carries the registry tool set', () => {
  test('every agent-facing capability has a demo tool', () => {
    const missing = AGENT_FACING.filter(
      (c) => !demoByName.has(c.id) && !ACCEPTED_MISSING_FROM_DEMO.has(c.id),
    ).map((c) => c.id);
    expect(missing).toEqual([]);
  });

  test('every demo tool is a real capability', () => {
    const registryIds = new Set(CAPABILITIES.map((c) => c.id));
    const invented = TOOL_SPECS.filter(
      (spec) => !registryIds.has(spec.name) && !ACCEPTED_DEMO_ONLY.has(spec.name),
    ).map((spec) => spec.name);
    // A tool here is the demo promising something the product cannot do.
    expect(invented).toEqual([]);
  });
});

describe('read and write mean the same thing on both sides', () => {
  test('every registry write is a write in the demo', () => {
    const writes = CAPABILITIES.filter((c) => c.kind === 'write');
    // Not vacuous: the registry has writes, and the demo carries all of them.
    expect(writes.length).toBeGreaterThan(0);
    for (const capability of writes) {
      const spec = demoByName.get(capability.id);
      if (!spec) {
        expect(ACCEPTED_MISSING_FROM_DEMO.has(capability.id)).toBe(true);
        continue;
      }
      // A registry write that the demo treats as a read would execute without
      // the confirmation dialog — the failure this whole pairing exists to stop.
      expect(spec.write).toBeTruthy();
    }
  });

  test('every registry read is a read in the demo', () => {
    for (const capability of CAPABILITIES.filter((c) => c.kind === 'read')) {
      const spec = demoByName.get(capability.id);
      if (!spec) continue;
      expect(spec.write).toBeUndefined();
    }
  });
});

describe('the accepted divergences are still real', () => {
  test('every excused-missing id is still a capability', () => {
    const registryIds = new Set(CAPABILITIES.map((c) => c.id));
    for (const id of ACCEPTED_MISSING_FROM_DEMO) {
      expect(registryIds.has(id)).toBe(true);
    }
  });

  test('every excused demo-only id is still a demo tool', () => {
    for (const name of ACCEPTED_DEMO_ONLY) {
      expect(demoByName.has(name)).toBe(true);
    }
  });

  test('nothing is excused that does not need excusing', () => {
    // An id on both lists at once, or excused while actually present on both
    // sides, is a stale entry hiding a divergence that has since been fixed.
    const registryIds = new Set(CAPABILITIES.map((c) => c.id));
    for (const id of ACCEPTED_MISSING_FROM_DEMO) expect(demoByName.has(id)).toBe(false);
    for (const name of ACCEPTED_DEMO_ONLY) expect(registryIds.has(name)).toBe(false);
  });
});
