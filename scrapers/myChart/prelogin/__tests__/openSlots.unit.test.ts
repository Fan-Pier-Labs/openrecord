/**
 * The anonymous slot search: date conversion, parsing, the paging stop
 * conditions, and the full walk against a per-session transport.
 *
 * The slot fixture is the shape a live instance returned (ids and names
 * replaced), so the field names here are MyChart's own.
 */
import { describe, expect, it } from 'bun:test';

import { createMockRequest, htmlResponse, jsonResponse, pageWithCsrfToken } from '../../auth/__tests__/mockMyChartRequest';
import {
  fetchOpenSlots,
  fetchProviderAvailability,
  fromEpicDte,
  localTodayDte,
  errorCodeOf,
  isSearchComplete,
  parseSlot,
  parseSlotsResponse,
  toEpicDte,
  type RawSlotsResponse,
} from '../openSlots';
import type { RawWorkflowData } from '../providerDirectory';

const workflow = {
  WorkflowSettings: {},
  Specialties: [
    { Id: 'SPEC-1', Name: 'Primary Care' },
    { Id: 'SPEC-2', Name: 'Cardiology' },
  ],
} as unknown as RawWorkflowData;

const specialtyData = {
  ProviderDepartmentPairs: [
    { ProviderId: 'PROV-1', DepartmentId: 'DEPT-1' },
    { ProviderId: 'PROV-2', DepartmentId: 'DEPT-2' },
  ],
  ReasonsForVisit: [
    { Id: 'RFV-req', Title: 'Request Only', CategoryValue: 'cat_1', CanDirectSchedule: false, DefaultVisitTypeId: 'VT-1' },
    { Id: 'RFV-ok', Title: 'New Patient', CategoryValue: 'cat_2', CanDirectSchedule: true, DefaultVisitTypeId: 'VT-2' },
  ],
  VisitTypes: [{ ID: 'VT-1' }, { ID: 'VT-2' }],
};

function slot(providerId: string, startUtc: string) {
  return {
    ProviderId: providerId,
    DepartmentId: 'DEPT-1',
    VisitTypeId: 'VT-2',
    DisplayDateTimeUtc: startUtc,
    DateString: 'Tuesday September 8, 2026',
    TimeString: '1:00 PM',
    TimeZoneMarker: 'EDT',
    LengthInMinutes: 30,
    TelehealthMode: 1,
    Dte: 67821,
  };
}

/** A transport whose GetSlots answers come from a queue, one per call. */
function mockSlots(responses: RawSlotsResponse[]) {
  let n = 0;
  const handle = createMockRequest(
    {
      '/OpenScheduling': () => htmlResponse(pageWithCsrfToken('tok-open')),
      '/Scheduling/Anonymous/GetSchedulingWorkflowData': () => jsonResponse(workflow),
      '/Scheduling/Anonymous/GetSpecialtyData': () => jsonResponse(specialtyData),
      '/Scheduling/Anonymous/GetSlots': () =>
        jsonResponse(responses[n++] ?? { Solutions: [], ContinueInfo: { IsStopSearch: true } }),
    },
    { firstPathPart: 'MyChart-SGH' },
  );
  /** The form-decoded body of each GetSlots POST, in order. */
  const slotCalls = () =>
    handle.callsTo('/Scheduling/Anonymous/GetSlots').map((c) => Object.fromEntries(new URLSearchParams(c.body ?? '')));
  return { request: handle.req, slotCalls };
}

describe('Epic date conversion', () => {
  it('round-trips the epoch a live response confirmed', () => {
    // Dte 67821 came back on a live slot dated 2026-09-08.
    expect(toEpicDte(new Date('2026-09-08T00:00:00Z'))).toBe(67821);
    expect(fromEpicDte(67821).toISOString().slice(0, 10)).toBe('2026-09-08');
  });

  it('ignores the time of day within a UTC day', () => {
    expect(toEpicDte(new Date('2026-09-08T23:59:59Z'))).toBe(toEpicDte(new Date('2026-09-08T00:00:01Z')));
  });

  it('takes "today" from the wall clock, so an evening call west of UTC keeps today', () => {
    // 9pm on the 8th locally is already the 9th in UTC; the search must still
    // start on the 8th, or same-day slots are silently skipped.
    const evening = new Date(2026, 8, 8, 21, 0, 0);
    expect(localTodayDte(evening)).toBe(toEpicDte(new Date('2026-09-08T00:00:00Z')));
  });
});

describe('parseSlot', () => {
  it('normalizes a slot and keeps the raw record', () => {
    const raw = slot('PROV-1', '2026-09-08T17:00:00Z');
    expect(parseSlot(raw)).toEqual({
      providerId: 'PROV-1',
      clinicId: 'DEPT-1',
      visitTypeId: 'VT-2',
      startUtc: '2026-09-08T17:00:00Z',
      localDate: 'Tuesday September 8, 2026',
      localTime: '1:00 PM',
      timeZoneMarker: 'EDT',
      lengthInMinutes: 30,
      telehealthMode: 1,
      raw,
    });
  });

  it('drops a slot with no provider or department to join on', () => {
    expect(parseSlot({ DepartmentId: 'DEPT-1' })).toBeNull();
    expect(parseSlot({ ProviderId: 'PROV-1' })).toBeNull();
  });

  it('flattens every solution into one slot list', () => {
    const data = {
      Solutions: [
        { Slots: [slot('PROV-1', '2026-09-08T17:00:00Z'), slot('PROV-1', '2026-09-08T18:00:00Z')] },
        { Slots: [slot('PROV-2', '2026-09-09T14:00:00Z')] },
        { Slots: null },
      ],
    };
    expect(parseSlotsResponse(data).map((s) => s.startUtc)).toEqual([
      '2026-09-08T17:00:00Z',
      '2026-09-08T18:00:00Z',
      '2026-09-09T14:00:00Z',
    ]);
  });
});

describe('isSearchComplete', () => {
  it('stops when the server says the search is over', () => {
    expect(isSearchComplete(null, { IsStopSearch: true })).toBe(true);
  });

  it('stops when the cursor stops moving, rather than looping forever', () => {
    const cursor = { State: 2, SearchRangeStartDte: 67821, NextProviderIndex: '16^1' };
    expect(isSearchComplete(cursor, { ...cursor })).toBe(true);
    expect(isSearchComplete(cursor, { ...cursor, NextProviderIndex: '17^1' })).toBe(false);
  });

  it('stops when the server sends no cursor at all', () => {
    expect(isSearchComplete(null, undefined)).toBe(true);
  });

  it('keeps going on a fresh cursor', () => {
    expect(isSearchComplete(null, { State: 2, NextProviderIndex: '16^1' })).toBe(false);
  });
});

describe('errorCodeOf', () => {
  it('passes a set code through and treats 0/null as no error', () => {
    expect(errorCodeOf({ ErrorCode: 3 })).toBe(3);
    expect(errorCodeOf({ ErrorCode: 0 })).toBeNull();
    expect(errorCodeOf({ ErrorCode: null })).toBeNull();
    expect(errorCodeOf({})).toBeNull();
  });
});

describe('fetchOpenSlots', () => {
  it('picks the directly schedulable reason and its visit type', async () => {
    const { request, slotCalls } = mockSlots([{ Solutions: [{ Slots: [slot('PROV-1', '2026-09-08T17:00:00Z')] }], ContinueInfo: { IsStopSearch: true } }]);
    const result = await fetchOpenSlots(request);

    expect(result.slots).toHaveLength(1);
    expect(result.complete).toBe(true);
    expect(result.errorCode).toBeNull();
    expect(result.specialty).toEqual({ id: 'SPEC-1', name: 'Primary Care' });
    // RFV-req cannot be direct-scheduled, so the search must use RFV-ok.
    expect(slotCalls()[0]!['appointmentBuilder.ReasonForVisitLine']).toBe('RFV-ok');
    expect(slotCalls()[0]!['appointmentBuilder.Appointments[0].VisitTypeId']).toBe('VT-2');
  });

  it('pages by echoing the cursor back until the server stops', async () => {
    const { request, slotCalls } = mockSlots([
      { Solutions: [{ Slots: [slot('PROV-1', '2026-09-08T17:00:00Z')] }], ContinueInfo: { State: 2, NextProviderIndex: '16^1' } },
      { Solutions: [{ Slots: [slot('PROV-2', '2026-09-09T14:00:00Z')] }], ContinueInfo: { IsStopSearch: true } },
    ]);
    const result = await fetchOpenSlots(request);

    expect(result.slots).toHaveLength(2);
    expect(result.pages).toBe(2);
    expect(result.complete).toBe(true);
    expect(slotCalls()[0]!['continueInfo.NextProviderIndex']).toBeUndefined();
    expect(slotCalls()[1]!['continueInfo.NextProviderIndex']).toBe('16^1');
  });

  it('stops on an error code and hands it back uninterpreted', async () => {
    const { request, slotCalls } = mockSlots([
      { Solutions: [{ Slots: [slot('PROV-1', '2026-09-08T17:00:00Z')] }], ErrorCode: 3, ContinueInfo: { State: 2, NextProviderIndex: '16^1' } },
    ]);
    const result = await fetchOpenSlots(request);

    expect(result.errorCode).toBe(3);
    expect(result.complete).toBe(false);
    expect(slotCalls()).toHaveLength(1);
    // The slots it did return are still handed back.
    expect(result.slots).toHaveLength(1);
  });

  it('honours the page cap when the server never stops', async () => {
    const endless = Array.from({ length: 5 }, (_, i) => ({
      Solutions: [{ Slots: [slot('PROV-1', `2026-09-0${i + 1}T17:00:00Z`)] }],
      ContinueInfo: { State: 2, NextProviderIndex: `${i}^1` },
    }));
    const { request, slotCalls } = mockSlots(endless);
    const result = await fetchOpenSlots(request, { maxPages: 3 });

    expect(slotCalls()).toHaveLength(3);
    expect(result.pages).toBe(3);
    expect(result.complete).toBe(false);
  });

  it('searches a named specialty and refuses an unknown one', async () => {
    const { request } = mockSlots([{ Solutions: [], ContinueInfo: { IsStopSearch: true } }]);
    expect((await fetchOpenSlots(request, { specialty: 'Cardiology' })).specialty.id).toBe('SPEC-2');
    await expect(fetchOpenSlots(request, { specialty: 'Podiatry' })).rejects.toThrow(/no specialty named/);
  });

  it('searches a named reason for visit and refuses an unknown one', async () => {
    const { request, slotCalls } = mockSlots([{ Solutions: [], ContinueInfo: { IsStopSearch: true } }]);
    await fetchOpenSlots(request, { reasonForVisit: 'Request Only' });
    // The named reason wins even though it is not directly schedulable.
    expect(slotCalls()[0]!['appointmentBuilder.ReasonForVisitLine']).toBe('RFV-req');

    await expect(fetchOpenSlots(request, { reasonForVisit: 'Annual Physical' })).rejects.toThrow(
      /no reason for visit named .*Annual Physical.* — it lists Request Only, New Patient/,
    );
  });

  it('sends an explicit startDate and caps the pairs', async () => {
    const { request, slotCalls } = mockSlots([{ Solutions: [], ContinueInfo: { IsStopSearch: true } }]);
    await fetchOpenSlots(request, { startDate: new Date('2026-09-08T00:00:00Z'), maxPairs: 1 });

    expect(slotCalls()[0]!['startDte']).toBe('67821');
    expect(slotCalls()[0]!['appointmentBuilder.Appointments[0].ProviderDepartmentPairs[0].ProviderId']).toBe('PROV-1');
    expect(slotCalls()[0]!['appointmentBuilder.Appointments[0].ProviderDepartmentPairs[1].ProviderId']).toBeUndefined();
  });

  it('sends the specialty id the live payload carries', async () => {
    const { request, slotCalls } = mockSlots([{ Solutions: [], ContinueInfo: { IsStopSearch: true } }]);
    await fetchOpenSlots(request);
    expect(slotCalls()[0]!['appointmentBuilder.SpecialtyId']).toBe('SPEC-1');
  });

  it('narrows to one provider without calling the endpoint when none match', async () => {
    const { request, slotCalls } = mockSlots([{ Solutions: [{ Slots: [slot('PROV-2', '2026-09-09T14:00:00Z')] }], ContinueInfo: { IsStopSearch: true } }]);
    const result = await fetchProviderAvailability(request, 'PROV-2');

    expect(result.slots.map((s) => s.providerId)).toEqual(['PROV-2']);
    expect(slotCalls()[0]!['appointmentBuilder.Appointments[0].ProviderDepartmentPairs[0].ProviderId']).toBe('PROV-2');
    expect(slotCalls()[0]!['appointmentBuilder.Appointments[0].ProviderDepartmentPairs[1].ProviderId']).toBeUndefined();

    const none = await fetchProviderAvailability(request, 'PROV-missing');
    expect(none.slots).toEqual([]);
    expect(none.complete).toBe(true);
    expect(slotCalls()).toHaveLength(1); // no second GetSlots
  });
});
