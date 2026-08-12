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
 * Every client now derives its list from `shared/capabilities.ts`. These tests
 * are what keeps that true: they read each client's real surface — the MCP
 * server's registered tools, the mobile agent's prompt, the CLI's dispatch,
 * the library's public exports — and fail if any of them stops covering an
 * entry in the registry. "Someone forgot" is now a red build.
 */

import { describe, it, expect } from 'bun:test';

import {
  CAPABILITIES,
  CAPABILITY_IDS,
  AGENT_CAPABILITIES,
  WRITE_CAPABILITY_IDS,
  getCapability,
  capabilitiesByGroup,
  executeCapability,
  describeCapability,
  encodeImageId,
  decodeImageId,
  resolveRecipient,
  resolveTopic,
} from '../capabilities';

// ── Registry shape ──────────────────────────────────────────────────────────

describe('the registry itself', () => {
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
      expect(typeof capability.run).toBe('function');
    }
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
    expect(WRITE_CAPABILITY_IDS).toContain('switch_patient');
  });

  it('groups without losing or duplicating an entry', () => {
    const grouped = capabilitiesByGroup().flatMap((g) => g.capabilities.map((c) => c.id));
    expect(grouped.sort()).toEqual([...CAPABILITY_IDS].sort());
  });

  it('describes a capability as a callable signature', () => {
    const line = describeCapability(getCapability('get_note_content')!);
    expect(line).toStartWith('get_note_content(csn, lrp_id, hno_id, hno_dat) — ');
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
    const ctx = { fdi: 'abc', ord: 'xyz' };
    const expected = Buffer.from(JSON.stringify({ fdi: ctx.fdi, ord: ctx.ord }), 'utf8').toString('base64url');
    expect(encodeImageId(ctx)).toBe(expected);
  });

  it('rejects a malformed token rather than returning junk', () => {
    expect(() => decodeImageId('not-a-real-token')).toThrow(/Invalid image_id/);
    expect(() => decodeImageId(Buffer.from('{"fdi":1}').toString('base64url'))).toThrow(/Invalid image_id/);
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
    expect(resolveTopic(topics, 'billing').displayName).toBe('Billing');
  });

  it('falls back to the first topic rather than refusing to send', () => {
    // MyChart requires a topic on every message and the category is cosmetic —
    // failing the send over it would strand the patient's message.
    expect(resolveTopic(topics, 'nonsense').displayName).toBe('Medical Question');
    expect(resolveTopic(topics, undefined).displayName).toBe('Medical Question');
  });

  it('throws when the instance offers no topics at all', () => {
    expect(() => resolveTopic([], 'anything')).toThrow(/No message topics/);
  });
});
