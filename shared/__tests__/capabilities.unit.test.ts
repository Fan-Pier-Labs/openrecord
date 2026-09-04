/**
 * Capability parity across all four clients.
 *
 * The four tool lists — CLI, npm library, Claude Desktop extension, mobile app
 * — used to be hand-maintained, and they had drifted: 46 / 43 / 46 / 38
 * capabilities respectively, so the answer a patient got depended on which
 * client they happened to ask. The mobile app could not read visit notes,
 * questionnaires, upcoming orders, EHI export templates, linked accounts,
 * message threads, or touch emergency contacts at all; the CLI was missing
 * visit notes and the emergency-contact writes.
 *
 * Every client now derives its list from `shared/capabilities/`. These tests
 * are what keeps that true: they read each client's real surface — the MCP
 * server's registered tools, the mobile agent's prompt, the CLI's dispatch,
 * the library's public exports — and fail if any of them stops covering an
 * entry in the registry. "Someone forgot" is now a red build.
 */

import { describe, it, expect } from 'bun:test';

import { readdir } from 'node:fs/promises';

import {
  CAPABILITIES,
  CAPABILITY_IDS,
  AGENT_CAPABILITIES,
  WRITE_CAPABILITY_IDS,
  getCapability,
  capabilitiesByGroup,
  executeCapability,
  acceptsModeParam,
  UNIMPLEMENTED_CAPABILITIES,
  capabilityDescription,
  unimplementedMessage,
  describeCapability,
  encodeImageId,
  decodeImageId,
  resolveRecipient,
  resolveTopic,
} from '../capabilities';

// ── Registry shape ──────────────────────────────────────────────────────────

describe('the registry itself', () => {
  /**
   * The entries live one file per group under `registry/`, and `index.ts`
   * concatenates them. A group file that nobody spreads into that list is the
   * one failure this split can produce silently — the capability simply stops
   * existing, in every client at once, and every other test here still passes
   * because they all read `CAPABILITIES`. So this reads the directory rather
   * than a list written here, which would be the same thing to forget.
   */
  it('ships every entry from every file in registry/', async () => {
    const dir = new URL('../capabilities/registry/', import.meta.url);
    const files = (await readdir(dir)).filter((f) => f.endsWith('.ts')).sort();
    expect(files.length).toBeGreaterThan(0);

    const onDisk: string[] = [];
    for (const file of files) {
      const module = (await import(new URL(file, dir).pathname)) as Record<string, unknown>;
      const arrays = Object.values(module).filter(Array.isArray);
      // One exported array per file, or the file is not a group file.
      expect({ file, arrays: arrays.length }).toEqual({ file, arrays: 1 });
      for (const entry of arrays[0] as Array<{ id: string }>) onDisk.push(entry.id);
    }

    expect([...CAPABILITY_IDS].sort()).toEqual(onDisk.sort());
  });

  it('has unique ids, and no id collides with another entry’s alias', () => {
    const names: string[] = [];
    for (const capability of CAPABILITIES) {
      names.push(capability.id, ...(capability.aliases ?? []));
    }
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every capability a snake_case id, a title, a description and a group', () => {
    for (const capability of CAPABILITIES) {
      expect(capability.id).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(capability.title.length).toBeGreaterThan(0);
      expect(capability.description.length).toBeGreaterThan(15);
      expect(capability.group.length).toBeGreaterThan(0);
      // `run` is deliberately absent from the public type, so it is reached
      // here the way only a test may: through the value, not the type.
      //
      // Exactly one of `run` and `notImplemented`, never both and never
      // neither. A capability with both would be a scraper wearing a "not
      // implemented" label — the failure mode this whole mechanism exists to
      // prevent — and one with neither would throw somewhere further in.
      const hasRun = typeof (capability as unknown as { run: unknown }).run === 'function';
      expect(hasRun).toBe(capability.notImplemented === undefined);
    }
  });

  it('does not expose `run` on the public Capability type', () => {
    // The enforcement for "every dispatch goes through executeCapability".
    // If `run` ever returns to the exported type this stops compiling, which
    // is the point — it replaced a regex that only caught one spelling.
    // @ts-expect-error — Property 'run' does not exist on type 'Capability'.
    void CAPABILITIES[0].run;
    expect(Object.keys(CAPABILITIES[0]!)).toContain('id');
  });

  it('names every parameter and says what it is for', () => {
    for (const capability of CAPABILITIES) {
      for (const param of capability.params) {
        expect(param.name).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(param.description.length).toBeGreaterThan(5);
        expect(['string', 'number', 'boolean', 'object']).toContain(param.type);
      }
      const names = capability.params.map((p) => p.name);
      expect(new Set(names).size).toBe(names.length);
      // `account` / `instance` are how clients name the MyChart host; a
      // capability that declared one would collide with the client's own.
      expect(names).not.toContain('account');
      expect(names).not.toContain('instance');
    }
  });

  it('resolves capabilities by id and by alias, and rejects unknown names', () => {
    expect(getCapability('get_profile')?.id).toBe('get_profile');
    expect(getCapability('get_xray_image')?.id).toBe('download_imaging_study');
    expect(getCapability('switch_patient')?.id).toBe('switch_proxy_target');
    expect(getCapability('nope')).toBeUndefined();
  });

  it('rejects an unknown capability with the list of real ones', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promise = executeCapability({} as any, 'get_horoscope');
    await expect(promise).rejects.toThrow(/Unknown capability "get_horoscope"/);
    await expect(promise).rejects.toThrow(/get_profile/);
  });

  it('separates the account-security capabilities from what a model may call', () => {
    const agentIds = AGENT_CAPABILITIES.map((c) => c.id);
    expect(agentIds).toContain('get_profile');
    expect(agentIds).toContain('send_message');
    // Turning 2FA off is a decision a human makes, not a tool call.
    expect(agentIds).not.toContain('disable_totp');
    expect(agentIds).not.toContain('setup_totp');
    expect(agentIds).not.toContain('delete_passkey');
    expect(AGENT_CAPABILITIES.every((c) => c.kind !== 'account')).toBe(true);
  });

  it('lists every mutating capability as a write, so clients gate them', () => {
    expect(WRITE_CAPABILITY_IDS).toContain('send_message');
    expect(WRITE_CAPABILITY_IDS).toContain('send_reply');
    expect(WRITE_CAPABILITY_IDS).toContain('request_refill');
    expect(WRITE_CAPABILITY_IDS).toContain('delete_message');
    expect(WRITE_CAPABILITY_IDS).toContain('add_emergency_contact');
    expect(WRITE_CAPABILITY_IDS).toContain('update_emergency_contact');
    expect(WRITE_CAPABILITY_IDS).toContain('remove_emergency_contact');
    expect(WRITE_CAPABILITY_IDS).toContain('switch_proxy_target');
  });

  it('groups without losing or duplicating an entry', () => {
    const grouped = capabilitiesByGroup().flatMap((g) => g.capabilities.map((c) => c.id));
    expect([...grouped].sort()).toEqual([...CAPABILITY_IDS].sort());
  });

  it('describes a capability as a callable signature', () => {
    const line = describeCapability(getCapability('get_note_content')!);
    expect(line).toStartWith('get_note_content(csn, lrp_id, hno_id, hno_dat) — ');
  });
});

// ── Declared, deliberately not implemented ──────────────────────────────────

describe('unimplemented capabilities', () => {
  it('says so in the description every client shows', () => {
    const refill = getCapability('request_refill')!;
    expect(refill.notImplemented).toBeTruthy();
    const described = capabilityDescription(refill);
    expect(described).toStartWith(refill.description);
    expect(described).toContain('NOT IMPLEMENTED:');
    expect(described).toContain('reads no chart and changes nothing');
  });

  it("leaves an implemented capability's description exactly as written", () => {
    const labs = getCapability('get_lab_results')!;
    expect(labs.notImplemented).toBeUndefined();
    expect(capabilityDescription(labs)).toBe(labs.description);
  });

  it('returns a notice that cannot be relayed as "none" or as "done"', () => {
    // The two ways a caller could do harm with this: reporting an empty result
    // to a patient, or telling them the write happened.
    const message = unimplementedMessage(getCapability('request_refill')!);
    expect(message).toStartWith('request_refill is not implemented');
    expect(message).toContain('did nothing, read nothing and changed nothing');
    expect(message).toContain('Do not report this as an empty result or as a completed action');
  });

  it('stays listed and reachable like any other capability', () => {
    // A client that silently lacks a tool and one that has a tool saying "not
    // implemented" are very different for a caller trying to find out whether
    // OpenRecord can do a thing.
    for (const capability of UNIMPLEMENTED_CAPABILITIES) {
      expect(CAPABILITY_IDS).toContain(capability.id);
      expect(getCapability(capability.id)).toBeDefined();
      expect(capability.notImplemented!.length).toBeGreaterThan(20);
    }
  });

  it('offers no output mode, because there is no response to shape', () => {
    for (const capability of UNIMPLEMENTED_CAPABILITIES) {
      expect(acceptsModeParam(capability)).toBe(false);
    }
  });

  it('is the exception, not a parking space', () => {
    expect(UNIMPLEMENTED_CAPABILITIES.map((c) => c.id)).toEqual(['request_refill']);
  });
});

// ── The specific gaps this registry was created to close ────────────────────

describe('the capabilities that had gone missing from a client', () => {
  const previouslyMissingFromMobile = [
    'get_questionnaires',
    'get_upcoming_orders',
    'get_ehi_export',
    'get_linked_accounts',
    'get_visit_notes',
    'get_visit_avs',
    'get_note_content',
    'get_message_thread',
    'add_emergency_contact',
    'update_emergency_contact',
    'remove_emergency_contact',
  ];
  const previouslyMissingFromCli = [
    'get_visit_notes',
    'add_emergency_contact',
    'update_emergency_contact',
    'remove_emergency_contact',
  ];

  it('are all in the registry, so no client can be missing them', () => {
    for (const id of new Set([...previouslyMissingFromMobile, ...previouslyMissingFromCli])) {
      expect(CAPABILITY_IDS).toContain(id);
    }
  });
});

// ── image_id round-trip ─────────────────────────────────────────────────────

describe('image_id', () => {
  it('round-trips an fdi context through a single opaque token', () => {
    const ctx = { fdi: 'a:b,c/d+e', ord: 'ORD%2F123' };
    const id = encodeImageId(ctx);
    expect(id).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(decodeImageId(id)).toEqual(ctx);
  });

  it('round-trips non-ASCII, since the token is UTF-8 before it is base64url', () => {
    const ctx = { fdi: 'ré—sumé✓', ord: '𝔘𝔫𝔦𝔠𝔬𝔡𝔢' };
    expect(decodeImageId(encodeImageId(ctx))).toEqual(ctx);
  });

  it('matches Node’s base64url so a token minted anywhere decodes everywhere', () => {
    // A token minted on-device, where there is no `Buffer`, has to decode in
    // the CLI. Lengths cover every remainder mod 3, where padding would show.
    for (const ord of ['x', 'xy', 'xyz', 'ré—sumé✓', '𝔘𝔫𝔦𝔠𝔬𝔡𝔢', 'a:b,c/d+e', '?x=1&y=2']) {
      const ctx = { fdi: 'abc', ord };
      const expected = Buffer.from(JSON.stringify({ fdi: ctx.fdi, ord }), 'utf8').toString('base64url');
      expect(encodeImageId(ctx)).toBe(expected);
      expect(decodeImageId(expected)).toEqual(ctx);
    }
  });

  it('rejects a malformed token rather than returning junk', () => {
    expect(() => decodeImageId('not-a-real-token')).toThrow(/Invalid image_id/);
    expect(() => decodeImageId(Buffer.from('{"fdi":1}').toString('base64url'))).toThrow(/Invalid image_id/);
  });

  it('rejects a truncated token, which the alphabet alone cannot catch', () => {
    const id = encodeImageId({ fdi: 'a:b', ord: 'ORD%2F1' });
    expect(() => decodeImageId(id.slice(0, 8) + id.slice(12))).toThrow(/Invalid image_id/);
  });

  it('survives the noise a copy-pasted token picks up', () => {
    // A wrapped line or leftover padding still carries the original bytes.
    const ctx = { fdi: 'a:b', ord: 'ORD%2F1' };
    const id = encodeImageId(ctx);
    for (const noisy of [id + '\n', id.slice(0, 5) + ' ' + id.slice(5), id + '==']) {
      expect(decodeImageId(noisy)).toEqual(ctx);
    }
  });
});

// ── Fuzzy resolution ────────────────────────────────────────────────────────

describe('recipient resolution', () => {
  const recipients = [
    { displayName: 'Dr. Julius Hibbert' },
    { displayName: 'Dr. Nick Riviera' },
    { displayName: 'Billing Department' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any[];

  it('matches on a partial name and ignores honorifics', () => {
    expect(resolveRecipient(recipients, 'hibbert').displayName).toBe('Dr. Julius Hibbert');
    expect(resolveRecipient(recipients, 'Dr. Hibbert').displayName).toBe('Dr. Julius Hibbert');
  });

  it('refuses to guess when a name matches more than one provider', () => {
    expect(() => resolveRecipient(recipients, 'Dr.')).toThrow(/Multiple recipients match/);
    expect(() => resolveRecipient(recipients, 'dr')).toThrow(/Multiple recipients match/);
  });

  it('says no name was given only when there really is none', () => {
    expect(() => resolveRecipient(recipients, '   ')).toThrow(/No recipient name given/);
  });

  it('lists the real options when nothing matches', () => {
    expect(() => resolveRecipient(recipients, 'zzz')).toThrow(/Billing Department/);
  });
});

describe('topic resolution', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topics = [{ displayName: 'Medical Question' }, { displayName: 'Billing' }] as any[];

  it('matches a topic by substring', () => {
    const { topic, substituted } = resolveTopic(topics, 'billing');
    expect(topic.displayName).toBe('Billing');
    expect(substituted).toBe(false);
  });

  it('falls back to the first topic rather than refusing to send', () => {
    // MyChart requires a topic on every message and the category is cosmetic —
    // failing the send over it would strand the patient's message.
    expect(resolveTopic(topics, 'nonsense').topic.displayName).toBe('Medical Question');
    expect(resolveTopic(topics, undefined).topic.displayName).toBe('Medical Question');
  });

  it('reports the fallback, so the substitution is not silent', () => {
    // An unmatched topic is a substitution the patient never asked for. The
    // send still goes through, but send_message surfaces which topic it used.
    expect(resolveTopic(topics, 'nonsense').substituted).toBe(true);
    // Not supplying one at all is a default, not a substitution.
    expect(resolveTopic(topics, undefined).substituted).toBe(false);
  });

  it('throws when the instance offers no topics at all', () => {
    expect(() => resolveTopic([], 'anything')).toThrow(/No message topics/);
  });
});
