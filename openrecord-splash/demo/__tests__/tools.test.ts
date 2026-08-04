/**
 * The demo's MyChart tool layer.
 *
 * The point of these is that the demo's write tools genuinely mutate session
 * state — a refill decrements the counter, a booked slot leaves the pool. If
 * that ever silently degrades into a canned response, the demo starts lying
 * about what the product does.
 */

import { describe, expect, test } from 'bun:test';
// @ts-expect-error — plain ES modules, no type declarations by design
import { createSession, executeTool, TOOL_SPECS, TOOL_NAMES, isWriteTool, getToolSpec, toolLatencyMs } from '../tools.js';
// @ts-expect-error — plain ES modules, no type declarations by design
import * as data from '../data.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Session = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result = any;

const run = (session: Session, name: string, args: Record<string, unknown> = {}): Result =>
  executeTool(session, name, args);

describe('tool catalogue', () => {
  test('every advertised tool has a handler', () => {
    const session = createSession();
    for (const name of TOOL_NAMES) {
      const result = run(session, name, { code: '123456', csn: 'x', hno_id: 'x', imaging_index: 0 });
      // Some tools legitimately return an error for these placeholder args; what
      // must never happen is the "unknown tool" error, which means the catalogue
      // advertises something that isn't implemented.
      expect(String(result?.error ?? '')).not.toContain('Unknown tool');
    }
  });

  test('unknown tools fail without throwing', () => {
    const result = run(createSession(), 'get_horoscope');
    expect(result.error).toContain('Unknown tool "get_horoscope"');
  });

  test('tool names are unique', () => {
    expect(new Set(TOOL_NAMES).size).toBe(TOOL_NAMES.length);
  });

  test('write tools are flagged, read tools are not', () => {
    expect(isWriteTool('send_message')).toBe(true);
    expect(isWriteTool('request_refill')).toBe(true);
    expect(isWriteTool('book_appointment')).toBe(true);
    expect(isWriteTool('get_medications')).toBe(false);
    expect(isWriteTool('nonexistent')).toBe(false);
  });

  test('every spec has a group and a description', () => {
    for (const spec of TOOL_SPECS) {
      expect(spec.group).toBeTruthy();
      expect(spec.description.length).toBeGreaterThan(10);
    }
  });

  test('getToolSpec resolves by name', () => {
    expect(getToolSpec('get_profile').group).toBe('Record');
    expect(getToolSpec('nope')).toBeUndefined();
  });

  test('simulated latency is positive for every tool', () => {
    for (const name of TOOL_NAMES) expect(toolLatencyMs(name)).toBeGreaterThan(0);
  });
});

describe('session isolation', () => {
  test('tool results cannot mutate the seed data', () => {
    const session = createSession();
    const meds = run(session, 'get_medications');
    meds[0].name = 'Tampered';
    meds[0].refillsRemaining = 999;

    expect(run(createSession(), 'get_medications')[0].name).toBe(data.medications[0].name);
    expect(data.medications[0].refillsRemaining).toBe(3);
  });

  test('two sessions do not share state', () => {
    const a = createSession();
    const b = createSession();
    run(a, 'request_refill', { medication_name: 'Atorvastatin' });

    expect(run(a, 'get_medications')[0].refillsRemaining).toBe(2);
    expect(run(b, 'get_medications')[0].refillsRemaining).toBe(3);
  });
});

describe('pagination', () => {
  test('lab results default to a 10-item page', () => {
    const page = run(createSession(), 'get_lab_results');
    expect(page.count).toBe(Math.min(10, data.labResults.length));
    expect(page.total).toBe(data.labResults.length);
    expect(page.results).toHaveLength(page.count);
  });

  test('limit and offset walk the full list', () => {
    const session = createSession();
    const first = run(session, 'get_lab_results', { limit: 3, offset: 0 });
    const second = run(session, 'get_lab_results', { limit: 3, offset: 3 });
    expect(first.results).toHaveLength(3);
    // Several panels share a collection date, so compare the panel itself.
    expect(second.results[0].testName).not.toBe(first.results[0].testName);
    expect(second.offset).toBe(3);
    expect(run(session, 'get_lab_results', { limit: 50 }).results).toHaveLength(data.labResults.length);
  });

  test('an offset past the end returns an empty page, not an error', () => {
    const page = run(createSession(), 'get_lab_results', { offset: 999 });
    expect(page.results).toHaveLength(0);
    expect(page.error).toBeUndefined();
  });
});

describe('request_refill', () => {
  test('decrements the refill count and records the fill date', () => {
    const session = createSession();
    const before = run(session, 'get_medications').find((m: Result) => m.name.startsWith('Atorvastatin'));
    const result = run(session, 'request_refill', { medication_name: 'atorvastatin' });

    expect(result.success).toBe(true);
    expect(result.refillsRemaining).toBe(before.refillsRemaining - 1);

    const after = run(session, 'get_medications').find((m: Result) => m.name.startsWith('Atorvastatin'));
    expect(after.refillsRemaining).toBe(before.refillsRemaining - 1);
    expect(after.lastFilled).not.toBe(before.lastFilled);
  });

  test('refuses a medication with no refills left', () => {
    const session = createSession();
    const result = run(session, 'request_refill', { medication_name: 'Metformin' });
    expect(result.error).toContain('no refills remaining');
    expect(run(session, 'get_medications').find((m: Result) => m.name.startsWith('Metformin')).refillsRemaining).toBe(0);
  });

  test('reports an unknown medication with the available list', () => {
    const result = run(createSession(), 'request_refill', { medication_name: 'ibuprofen' });
    expect(result.error).toContain('No medication matching');
    expect(result.error).toContain('Atorvastatin 40mg');
  });

  test('an ambiguous match asks for specificity instead of guessing', () => {
    // Every demo medication carries a dose, so "mg" matches all four.
    const result = run(createSession(), 'request_refill', { medication_name: 'mg' });
    expect(result.error).toContain('Multiple medications match');
  });
});

describe('messaging', () => {
  test('a sent message appears at the top of get_messages', () => {
    const session = createSession();
    const before = run(session, 'get_messages').total;

    const result = run(session, 'send_message', {
      recipient_name: 'Hibbert',
      topic: 'Medical Question',
      subject: 'Question about my A1c',
      message_body: 'Should we revisit the metformin dose?',
    });
    expect(result.success).toBe(true);
    expect(result.recipient).toBe('Dr. Julius Hibbert');

    const after = run(session, 'get_messages');
    expect(after.total).toBe(before + 1);
    expect(after.conversations[0].subject).toBe('Question about my A1c');
    expect(after.conversations[0].sentThisSession).toBe(true);
  });

  test('send_message requires a subject and a body', () => {
    const result = run(createSession(), 'send_message', { recipient_name: 'Hibbert', subject: 'Hi' });
    expect(result.error).toContain('subject and message_body');
  });

  test('an unknown recipient lists the valid ones', () => {
    const result = run(createSession(), 'send_message', {
      recipient_name: 'Dr. Zoidberg',
      subject: 'x',
      message_body: 'y',
    });
    expect(result.error).toContain('No recipient matching');
    expect(result.error).toContain('Patient Accounts');
  });

  test('send_reply appends to the existing thread', () => {
    const session = createSession();
    const thread = run(session, 'get_messages').conversations[0];
    const count = thread.messages.length;

    const result = run(session, 'send_reply', { conversation_id: thread.id, message_body: 'Thanks!' });
    expect(result.success).toBe(true);

    const updated = run(session, 'get_messages').conversations.find((c: Result) => c.id === thread.id);
    expect(updated.messages).toHaveLength(count + 1);
    expect(updated.messages.at(-1).body).toBe('Thanks!');
  });

  test('send_reply rejects an unknown conversation', () => {
    const result = run(createSession(), 'send_reply', { conversation_id: 'nope', message_body: 'x' });
    expect(result.error).toContain('No conversation with id');
  });
});

describe('appointments', () => {
  test('booking moves the slot out of the pool and into upcoming visits', () => {
    const session = createSession();
    const providers = run(session, 'get_available_appointments');
    const slot = providers[0].slots[0];
    const upcomingBefore = run(session, 'get_upcoming_visits').length;

    const result = run(session, 'book_appointment', { slot_id: slot.slotId, reason: 'Follow-up' });
    expect(result.success).toBe(true);
    expect(result.date).toBe(slot.date);
    expect(result.confirmationNumber).toContain('SPRFLD-');

    const upcoming = run(session, 'get_upcoming_visits');
    expect(upcoming).toHaveLength(upcomingBefore + 1);
    expect(upcoming.some((v: Result) => v.bookedThisSession && v.date === slot.date)).toBe(true);

    const remaining = run(session, 'get_available_appointments');
    const stillOffered = remaining.flatMap((p: Result) => p.slots).some((s: Result) => s.slotId === slot.slotId);
    expect(stillOffered).toBe(false);
  });

  test('the same slot cannot be booked twice', () => {
    const session = createSession();
    const slot = run(session, 'get_available_appointments')[0].slots[0];
    run(session, 'book_appointment', { slot_id: slot.slotId });
    expect(run(session, 'book_appointment', { slot_id: slot.slotId }).error).toContain('is not available');
  });

  test('filters narrow the slot list', () => {
    const session = createSession();
    const filtered = run(session, 'get_available_appointments', { provider_name: 'riviera' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].provider).toBe('Dr. Nick Riviera');
    expect(run(session, 'get_available_appointments', { provider_name: 'zoidberg' }).error).toBeTruthy();
  });

  test('upcoming visits stay in date order after a booking', () => {
    const session = createSession();
    const slot = run(session, 'get_available_appointments')[0].slots[0];
    run(session, 'book_appointment', { slot_id: slot.slotId });
    const dates = run(session, 'get_upcoming_visits').map((v: Result) => v.date);
    expect([...dates].sort()).toEqual(dates);
  });
});

describe('emergency contacts', () => {
  test('add, update, and remove round-trip through get_emergency_contacts', () => {
    const session = createSession();
    const before = run(session, 'get_emergency_contacts').length;

    const added = run(session, 'add_emergency_contact', {
      name: 'Lisa Simpson',
      relationship_type: 'Daughter',
      phone_number: '(555) 636-7666',
    });
    expect(added.success).toBe(true);
    expect(run(session, 'get_emergency_contacts')).toHaveLength(before + 1);

    const id = added.contact.id;
    expect(run(session, 'update_emergency_contact', { id, phone_number: '(555) 000-0000' }).success).toBe(true);
    expect(run(session, 'get_emergency_contacts').find((c: Result) => c.id === id).phone).toBe('(555) 000-0000');

    expect(run(session, 'remove_emergency_contact', { id }).success).toBe(true);
    expect(run(session, 'get_emergency_contacts')).toHaveLength(before);
  });

  test('add requires a name and a phone number', () => {
    expect(run(createSession(), 'add_emergency_contact', { name: 'Lisa' }).error).toContain('required');
  });

  test('update and remove reject unknown ids', () => {
    const session = createSession();
    expect(run(session, 'update_emergency_contact', { id: 'ec-999', name: 'x' }).error).toContain('No emergency contact');
    expect(run(session, 'remove_emergency_contact', { id: 'ec-999' }).error).toContain('No emergency contact');
  });
});

describe('session and imaging', () => {
  test('connect_instance marks the session connected', () => {
    const session = createSession();
    expect(run(session, 'check_session').connected).toBe(false);
    run(session, 'connect_instance', { instance: data.DEMO_HOSTNAME });
    expect(run(session, 'check_session').connected).toBe(true);
    expect(run(session, 'list_accounts')[0].connected).toBe(true);
  });

  test('complete_2fa rejects a code that is not six digits', () => {
    const session = createSession();
    expect(run(session, 'complete_2fa', { code: '123' }).error).toContain('6 digits');
    expect(run(session, 'complete_2fa', { code: '123456' }).status).toBe('logged_in');
  });

  test('get_xray_image returns an attachment the UI can render', () => {
    const result = run(createSession(), 'get_xray_image', { imaging_index: 0 });
    expect(result.attachment.kind).toBe('xray');
    expect(result.study).toBe(data.imagingResults[0].study);
  });

  test('get_xray_image rejects an out-of-range index', () => {
    expect(run(createSession(), 'get_xray_image', { imaging_index: 9 }).error).toContain('No imaging study');
  });

  test('get_past_visits filters by years_back', () => {
    const session = createSession();
    expect(run(session, 'get_past_visits')).toHaveLength(data.pastVisits.length);
    // "today" is pinned at 2026-03-21, so a one-year window drops the 2024
    // surgical visit and keeps the three from 2025 onward.
    const recent = run(session, 'get_past_visits', { years_back: 1 });
    expect(recent.length).toBeLessThan(data.pastVisits.length);
    expect(recent.every((v: Result) => v.date >= '2025-03-21')).toBe(true);
  });
});

describe('the fictional record contains no real-looking identifiers', () => {
  test('every phone number is in the reserved 555 range', () => {
    const blob = JSON.stringify(data);
    const phones = blob.match(/\(\d{3}\) \d{3}-\d{4}/g) ?? [];
    expect(phones.length).toBeGreaterThan(0);
    for (const phone of phones) expect(phone.startsWith('(555)')).toBe(true);
  });

  test('every hostname and email is under a reserved example domain', () => {
    const blob = JSON.stringify(data);
    for (const host of blob.match(/mychart\.[a-z0-9.-]+/g) ?? []) {
      expect(host.endsWith('.example.org')).toBe(true);
    }
    for (const email of blob.match(/[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []) {
      expect(email.endsWith('@example.com')).toBe(true);
    }
  });
});
