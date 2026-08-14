/**
 * The demo's MyChart tool layer.
 *
 * The point of these is that the demo's write tools genuinely mutate session
 * state — a refill decrements the counter, a booked slot leaves the pool. If
 * that ever silently degrades into a canned response, the demo starts lying
 * about what the product does.
 */

import { describe, expect, test } from 'bun:test';
import { createSession, executeTool, matchesName, TOOL_SPECS, TOOL_NAMES, isWriteTool, getToolSpec, toolLatencyMs } from '../src/tools';
import * as data from '../src/data';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

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
    expect(getToolSpec('get_profile')!.group).toBe('Record');
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

    expect(run(createSession(), 'get_medications')[0]!.name).toBe(data.medications[0]!.name);
    expect(data.medications[0]!.refillsRemaining).toBe(3);
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
    expect(result.error).toContain('subject and message');
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
    const dates: string[] = run(session, 'get_upcoming_visits').map((v: Result) => v.date);
    // Same comparator `book_appointment` re-sorts the list with. The dates are
    // ISO `YYYY-MM-DD`, so this ordering is chronological.
    expect([...dates].sort((a, b) => a.localeCompare(b))).toEqual(dates);
  });

  test('the colonoscopy alert card can actually be fulfilled', () => {
    // The home-screen card says "Show me what appointment slots are open and
    // help me get one booked" — that promise needs a Colonoscopy visit type in
    // the pool, or the flow dead-ends on every run.
    const session = createSession();
    const offers = run(session, 'get_available_appointments', { visit_type: 'Colonoscopy' });
    expect(offers.error).toBeUndefined();
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0].slots.length).toBeGreaterThan(0);

    const booked = run(session, 'book_appointment', { slot_id: offers[0].slots[0].slotId, reason: 'Overdue screening' });
    expect(booked.success).toBe(true);
    expect(booked.visitType).toBe('Colonoscopy');
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

  test('download_imaging_study returns an attachment the UI can render', () => {
    const result = run(createSession(), 'download_imaging_study', { imaging_index: 0 });
    expect(result.attachment.kind).toBe('xray');
    expect(result.studyName).toBe(data.imagingResults[0]!.study);
    expect(result.totalImages).toBe(result.images.length);
    expect(result.images[0].seriesDescription).toBe(data.imagingResults[0]!.series[0]!.seriesDescription);
  });

  test('the old get_xray_image name still resolves', () => {
    // The registry keeps `get_xray_image` as an alias of download_imaging_study,
    // so a model working from an older prompt must not hit "unknown tool".
    const result = run(createSession(), 'get_xray_image', { imaging_index: 0 });
    expect(result.attachment.kind).toBe('xray');
  });

  test('download_imaging_study accepts the image_id from get_imaging_results', () => {
    const session = createSession();
    const listed = run(session, 'get_imaging_results');
    const first = listed.results[0];
    expect(first.image_id).toBeTruthy();
    // The listing hands out an opaque token and an index; both must resolve to
    // the same study, because a model will use whichever it copied.
    const byId = run(session, 'download_imaging_study', { image_id: first.image_id });
    expect(byId.studyName).toBe(first.study);
    expect(byId.totalImages).toBe(run(session, 'download_imaging_study', { imaging_index: 0 }).totalImages);
  });

  test('a report-only study carries no image_id and cannot be downloaded', () => {
    const session = createSession();
    const listed = run(session, 'get_imaging_results');
    const reportOnly = listed.results.find((r: Result) => !r.image_id);
    expect(reportOnly).toBeDefined();
    expect(reportOnly.impression.length).toBeGreaterThan(0);
    const index = listed.results.indexOf(reportOnly);
    expect(run(session, 'download_imaging_study', { imaging_index: index }).error).toContain('no viewable images');
  });

  test('download_imaging_study rejects a bad identifier rather than guessing', () => {
    const session = createSession();
    expect(run(session, 'download_imaging_study', { imaging_index: 9 }).error).toContain('No imaging result at index 9');
    expect(run(session, 'download_imaging_study', { image_id: 'nope' }).error).toContain('Invalid image_id');
    expect(run(session, 'download_imaging_study', {}).error).toContain('Pass either image_id');
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

describe('matchesName', () => {
  test('matches a name the patient shortened by dropping the middle name', () => {
    // "dr. julius hibbert".includes("dr. hibbert") is false. Substring matching
    // alone silently broke the demo's own suggested appointment prompt.
    expect(matchesName('Dr. Julius Hibbert', 'Dr. Hibbert')).toBe(true);
    expect(matchesName('Dr. Julius Hibbert', 'hibbert')).toBe(true);
    expect(matchesName('Dr. Julius Hibbert', 'julius')).toBe(true);
  });

  test('still refuses a different person', () => {
    expect(matchesName('Dr. Julius Hibbert', 'Dr. Nick Riviera')).toBe(false);
    expect(matchesName('Dr. Julius Hibbert', 'Riviera')).toBe(false);
  });

  test('is order-insensitive but needs every word', () => {
    expect(matchesName('Dr. Julius Hibbert', 'hibbert julius')).toBe(true);
    expect(matchesName('Dr. Julius Hibbert', 'hibbert riviera')).toBe(false);
  });

  test('an empty query matches nothing', () => {
    expect(matchesName('Dr. Julius Hibbert', '   ')).toBe(false);
  });
});

describe('get_available_appointments filtering', () => {
  test('finds slots by the name a patient would actually type', () => {
    const s = createSession();
    const all = executeTool(s, 'get_available_appointments', {}) as Any;
    const byName = executeTool(s, 'get_available_appointments', { provider_name: 'Dr. Hibbert' }) as Any;

    expect(Array.isArray(all)).toBe(true);
    expect(Array.isArray(byName)).toBe(true);
    expect(byName[0].provider).toBe('Dr. Julius Hibbert');
    expect(byName[0].slots.length).toBeGreaterThan(0);
  });

  test('the whole suggested prompt works: find a slot, then book it', () => {
    const s = createSession();
    const offers = executeTool(s, 'get_available_appointments', { provider_name: 'Dr. Hibbert' }) as Any;
    const slot = offers[0].slots[0];
    const booked = executeTool(s, 'book_appointment', { slot_id: slot.slotId, reason: 'Follow-up' }) as Any;

    expect(booked.error).toBeUndefined();
    expect(s.upcomingVisits.some((v: Any) => v.date === slot.date && v.time === slot.time)).toBe(true);
  });

  test('an unknown provider still returns an honest error', () => {
    const s = createSession();
    const none = executeTool(s, 'get_available_appointments', { provider_name: 'Dr. Zoidberg' }) as Any;
    expect(none.error).toContain('No available appointments');
  });

  test('a no-match error names what is bookable so the model can recover', () => {
    // A weak model invents filter values ("visit_type: New Appointment"). Left
    // to a bare "no matches" it dead-ends and tells the patient nothing is free.
    const s = createSession();
    const none = executeTool(s, 'get_available_appointments', {
      provider_name: 'Dr. Hibbert',
      visit_type: 'New Appointment',
    }) as Any;

    expect(none.error).toContain('Dr. Julius Hibbert');
    expect(none.error).toContain('Office Visit');
  });
});

describe('message threads and topics', () => {
  test('get_message_thread returns one conversation in MyChart field names', () => {
    const session = createSession();
    const id = data.messages[0]!.id;
    const thread = run(session, 'get_message_thread', { conversation_id: id });

    expect(thread.conversationId).toBe(id);
    expect(thread.subject).toBe(data.messages[0]!.subject);
    expect(thread.messages).toHaveLength(data.messages[0]!.messages.length);
    const [first] = thread.messages;
    expect(first.senderName).toBe(data.messages[0]!.messages[0]!.from);
    expect(first.messageBody).toBe(data.messages[0]!.messages[0]!.body);
    expect(first.messageId).toBeTruthy();
  });

  test('isFromPatient survives the record using a fuller legal name', () => {
    // The chart says "Homer J. Simpson"; his own messages are signed "Homer
    // Simpson". A strict equality check flags every patient message as the
    // doctor's, which reads as the care team saying things the patient said.
    const session = createSession();
    const thread = run(session, 'get_message_thread', { conversation_id: 'msg-002' });
    const fromPatient = thread.messages.filter((m: Result) => m.isFromPatient);
    expect(fromPatient).toHaveLength(1);
    expect(fromPatient[0].senderName).toBe('Homer Simpson');
  });

  test('an unknown conversation id is an error naming the fix', () => {
    const result = run(createSession(), 'get_message_thread', { conversation_id: 'msg-nope' });
    expect(result.error).toContain('Call get_messages');
  });

  test('a message sent this session is immediately readable as a thread', () => {
    const session = createSession();
    const sent = run(session, 'send_message', {
      recipient_name: 'Hibbert',
      subject: 'Question about my A1c',
      message_body: 'Should I be worried about the trend?',
    });
    const thread = run(session, 'get_message_thread', { conversation_id: sent.conversationId });
    expect(thread.messages[0].messageBody).toBe('Should I be worried about the trend?');
    expect(thread.messages[0].isFromPatient).toBe(true);
  });

  test('get_message_topics and get_message_recipients are separate lists', () => {
    const session = createSession();
    // The registry serves these from two different endpoints and exposes them
    // as two tools; the demo used to fold them into one result.
    const recipients = run(session, 'get_message_recipients');
    const topics = run(session, 'get_message_topics');
    expect(recipients.topics).toBeUndefined();
    expect(recipients.recipients.length).toBeGreaterThan(0);
    expect(topics.topics).toEqual(data.messageTopics);
  });

  test('send_message reports a substituted topic instead of silently swapping', () => {
    const session = createSession();
    const exact = run(session, 'send_message', {
      recipient_name: 'Patient Accounts',
      topic: 'Billing Question',
      subject: 'Itemized statement',
      message_body: 'Please send an itemized statement.',
    });
    expect(exact.topic_used).toBe('Billing Question');
    expect(exact.topic_substituted).toBeUndefined();

    const invented = run(session, 'send_message', {
      recipient_name: 'Patient Accounts',
      topic: 'Complaints Department',
      subject: 'Itemized statement',
      message_body: 'Please send an itemized statement.',
    });
    expect(invented.topic_used).toBe(data.messageTopics[0]!.displayName);
    expect(invented.topic_substituted).toContain('Complaints Department');
  });
});

describe('the message-body argument', () => {
  test('both the registry name and the demo\'s older one are accepted', () => {
    // The catalogue advertises `message`, matching shared/capabilities.ts. A
    // model that learned `message_body` from an earlier prompt must not have
    // its message silently dropped — an empty body is a message the patient
    // thinks they sent.
    const session = createSession();
    const registryName = run(session, 'send_message', {
      recipient_name: 'Hibbert',
      subject: 'A',
      message: 'sent with message',
    });
    const olderName = run(session, 'send_message', {
      recipient_name: 'Hibbert',
      subject: 'B',
      message_body: 'sent with message_body',
    });

    expect(registryName.success).toBe(true);
    expect(olderName.success).toBe(true);
    const bodies = run(session, 'get_messages')
      .conversations.filter((c: Result) => c.sentThisSession)
      .map((c: Result) => c.messages[0].body);
    expect(bodies).toContain('sent with message');
    expect(bodies).toContain('sent with message_body');
  });
});

describe('delete_message', () => {
  test('removes the conversation from the inbox', () => {
    const session = createSession();
    const before = run(session, 'get_messages', { limit: 50 }).total;
    const result = run(session, 'delete_message', { conversation_id: 'msg-002' });

    expect(result.success).toBe(true);
    expect(result.subject).toBe('Prescription Renewal Request');
    const after = run(session, 'get_messages', { limit: 50 });
    expect(after.total).toBe(before - 1);
    expect(after.conversations.some((c: Result) => c.id === 'msg-002')).toBe(false);
  });

  test('is a write tool, so the agent loop gates it behind a confirmation', () => {
    expect(isWriteTool('delete_message')).toBe(true);
  });

  test('an unknown id changes nothing', () => {
    const session = createSession();
    const before = run(session, 'get_messages', { limit: 50 }).total;
    expect(run(session, 'delete_message', { conversation_id: 'msg-nope' }).error).toContain('No conversation');
    expect(run(session, 'get_messages', { limit: 50 }).total).toBe(before);
  });
});

describe('get_letter_details', () => {
  test('every letter listed can be opened by its hno_id', () => {
    const session = createSession();
    const letters = run(session, 'get_letters');
    expect(letters.length).toBeGreaterThan(0);
    for (const letter of letters) {
      const details = run(session, 'get_letter_details', { hno_id: letter.hnoId, csn: letter.csn });
      expect(details.bodyHTML.length).toBeGreaterThan(0);
    }
  });

  test('an unknown hno_id comes back empty, the way a real instance answers', () => {
    // Real MyChart returns a literal JSON null for an hnoId it does not know,
    // which the scraper turns into an empty body rather than an error.
    const details = run(createSession(), 'get_letter_details', { hno_id: 'WP-demo-hno-nope', csn: 'x' });
    expect(details.bodyHTML).toBe('');
    expect(details.error).toBeUndefined();
  });

  test('a missing hno_id says what to pass', () => {
    expect(run(createSession(), 'get_letter_details', {}).error).toContain('hno_id is required');
  });
});

describe('proxy access', () => {
  test('list_proxy_targets reports both records and which one is active', () => {
    const result = run(createSession(), 'list_proxy_targets');
    expect(result.count).toBe(2);
    expect(result.active_patient).toBe('Homer Simpson');
    expect(result.patients.find((p: Result) => p.is_self).is_active).toBe(true);
    expect(result.message).toContain('switch_proxy_target');
  });

  test('switching changes what every data tool reads', () => {
    const session = createSession();
    expect(run(session, 'get_profile').name).toBe('Homer J. Simpson');

    const switched = run(session, 'switch_proxy_target', { patient: 'Bart' });
    expect(switched.switched_to).toBe('Bart Simpson');
    expect(switched.verified_profile_name).toBe('Bartholomew J. Simpson');

    // The whole point: this is a different chart, not a relabelled one.
    expect(run(session, 'get_profile', { patient: 'Bart Simpson' }).name).toBe('Bartholomew J. Simpson');
    expect(run(session, 'get_medications', { patient: 'Bart Simpson' })[0].name).toContain('Albuterol');
    expect(run(session, 'get_lab_results', { patient: 'Bart Simpson' }).total).toBe(3);
  });

  test('a read refuses rather than answering about the wrong patient', () => {
    const session = createSession();
    run(session, 'switch_proxy_target', { patient: 'Bart' });

    // No `patient` means the account holder — explicitly, not "whoever we
    // happen to be pointed at". Answering here would hand Homer's question
    // Bart's chart.
    const refused = run(session, 'get_medications');
    expect(refused.error).toContain('MyChart is currently on Bart Simpson');
    expect(refused.error).toContain('switch_proxy_target');

    // And asking for a third person is an error, not a silent fallback.
    expect(run(session, 'get_medications', { patient: 'Lisa Simpson' }).error).toContain('No patient matching');
  });

  test('"me" switches back to the account holder', () => {
    const session = createSession();
    run(session, 'switch_proxy_target', { patient: 'Bart Simpson' });
    const back = run(session, 'switch_proxy_target', { patient: 'me' });

    expect(back.is_self).toBe(true);
    expect(back.message).not.toContain('Switch back');
    expect(run(session, 'get_profile').name).toBe('Homer J. Simpson');
  });

  test('the two charts keep their own mutations', () => {
    const session = createSession();
    run(session, 'request_refill', { medication_name: 'Atorvastatin' });
    const homerRefills = run(session, 'get_medications')[0].refillsRemaining;

    run(session, 'switch_proxy_target', { patient: 'Bart' });
    run(session, 'request_refill', { medication_name: 'Albuterol', patient: 'Bart Simpson' });
    expect(run(session, 'get_medications', { patient: 'Bart Simpson' })[0].refillsRemaining).toBe(0);

    run(session, 'switch_proxy_target', { patient: 'me' });
    expect(run(session, 'get_medications')[0].refillsRemaining).toBe(homerRefills);
  });

  test('switching with no patient, or an unknown one, is refused', () => {
    const session = createSession();
    expect(run(session, 'switch_proxy_target', {}).error).toContain('Pass the patient');
    expect(run(session, 'switch_proxy_target', { patient: 'Ned Flanders' }).error).toContain('No patient matching');
    expect(run(session, 'get_profile').name).toBe('Homer J. Simpson');
  });

  test('the proxy tools themselves are exempt from the assertion', () => {
    // Guarding "you must already be on patient X" in front of the tools that
    // list and change X would make them unusable exactly when they are needed.
    const session = createSession();
    run(session, 'switch_proxy_target', { patient: 'Bart' });
    expect(run(session, 'list_proxy_targets').active_patient).toBe('Bart Simpson');
    expect(run(session, 'switch_proxy_target', { patient: 'me' }).error).toBeUndefined();
  });
});

describe('account meta tools', () => {
  test('search_mycharts finds the demo instance by a partial name', () => {
    const result = run(createSession(), 'search_mycharts', { query: 'springfield' });
    expect(result.count).toBeGreaterThan(0);
    expect(result.matches[0].hostname).toBe(data.DEMO_HOSTNAME);
    expect(result.matches[0].loginUrl).toContain(data.DEMO_HOSTNAME);
  });

  test('search_mycharts caps results and reports an empty search honestly', () => {
    const session = createSession();
    expect(run(session, 'search_mycharts', { query: 'mychart', limit: 2 }).matches).toHaveLength(2);
    expect(run(session, 'search_mycharts', { query: 'mayo' }).count).toBe(0);
    expect(run(session, 'search_mycharts', {}).error).toContain('Pass a query');
  });

  test('setup_account logs in and reports the saved passkey', () => {
    const session = createSession();
    const result = run(session, 'setup_account', {
      hostname: data.DEMO_HOSTNAME,
      username: 'homersimpson742',
      password: 'donuts123',
    });
    expect(result.state).toBe('logged_in');
    expect(result.account).toBe(`homersimpson742@${data.DEMO_HOSTNAME}`);
    expect(run(session, 'check_session').connected).toBe(true);
  });

  test('setup_account runs the 2FA branch, and complete_2fa finishes it', () => {
    const session = createSession();
    const pending = run(session, 'setup_account', {
      hostname: data.DEMO_HOSTNAME,
      username: 'margesimpson',
      password: 'unclesteve',
    });
    expect(pending.state).toBe('need_2fa');
    expect(pending.pending_id).toBeTruthy();

    expect(run(session, 'complete_2fa', { pending_id: 'pending-nope', code: '123456' }).error).toContain('pending_id');
    const done = run(session, 'complete_2fa', { pending_id: pending.pending_id, code: '123456' });
    expect(done.state).toBe('logged_in');
    expect(run(session, 'list_accounts')[0].username).toBe('margesimpson');
  });

  test('setup_account refuses a hostname that is not a MyChart instance', () => {
    const session = createSession();
    expect(run(session, 'setup_account', { hostname: 'evil.example.com', username: 'a', password: 'b' }).error)
      .toContain('search_mycharts');
    expect(run(session, 'setup_account', { hostname: data.DEMO_HOSTNAME, username: 'homer' }).state)
      .toBe('invalid_login');
  });

  test('disconnect_account leaves the data tools with nothing to read', () => {
    const session = createSession();
    expect(run(session, 'get_profile').name).toBeTruthy();

    const result = run(session, 'disconnect_account', { account: `${data.DEMO_USERNAME}@${data.DEMO_HOSTNAME}` });
    expect(result.success).toBe(true);
    expect(run(session, 'list_accounts')).toHaveLength(0);
    // Same failure the real extension produces once the credentials are gone.
    expect(run(session, 'get_profile').error).toContain('setup_account');

    // And setting it back up restores them.
    run(session, 'setup_account', {
      hostname: data.DEMO_HOSTNAME,
      username: data.DEMO_USERNAME,
      password: 'donuts123',
    });
    expect(run(session, 'get_profile').name).toBe('Homer J. Simpson');
  });

  test('disconnect_account refuses an account it does not have', () => {
    const session = createSession();
    expect(run(session, 'disconnect_account', { account: 'someone@else.example.org' }).error).toContain('list_accounts');
    expect(run(session, 'get_profile').name).toBeTruthy();
  });
});
