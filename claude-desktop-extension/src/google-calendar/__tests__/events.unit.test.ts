// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { describe, expect, it } from 'bun:test';

import { eventId, isSyncableVisit, visitToEvent, type SyncVisit } from '../events';

const visit = (over: Partial<SyncVisit> = {}): SyncVisit => ({
  Csn: '1001',
  CsnForECheckIn: null,
  Id: null,
  instantISO: '2026-12-01T15:00:00.000Z',
  PrimaryDate: '12/01/2026 10:00:00 AM',
  IsTimeToBeDetermined: false,
  IsHideVisitTime: false,
  DurationInMinutes: 45,
  ArrivalTime: null,
  VisitTypeName: 'Office Visit',
  PrimaryProviderName: 'Dr. Example',
  PrimaryDepartment: {
    Name: 'Example Clinic',
    Address: ['1 Main St', 'Springfield'],
    PhoneNumber: '555-0100',
    Specialty: { Title: null },
    Instructions: [],
    ArrivalLocation: null,
    TimeZone: null,
  },
  organizationName: '',
  status: 'scheduled',
  Telemedicine: null,
  ...over,
});

describe('visitToEvent', () => {
  it('maps a timed visit to a timed event lasting its duration', () => {
    const e = visitToEvent('tag1', visit())!;
    expect(e.summary).toBe('Office Visit with Dr. Example');
    expect(e.location).toBe('Example Clinic, 1 Main St, Springfield');
    expect(e.start).toEqual({ dateTime: '2026-12-01T15:00:00.000Z' });
    expect(e.end).toEqual({ dateTime: '2026-12-01T15:45:00.000Z' });
    expect(e.extendedProperties.private.openrecordAccount).toBe('tag1');
    expect(e.description).toBe('Clinic phone: 555-0100\n\nSynced from MyChart by OpenRecord. Edits here are overwritten on the next sync.');
  });

  it('defaults to 30 minutes when MyChart gives no duration', () => {
    const e = visitToEvent('a@b.org', visit({ DurationInMinutes: null }))!;
    expect(e.end).toEqual({ dateTime: '2026-12-01T15:30:00.000Z' });
  });

  it('puts a visit with no clock time on its clinic-local day instead of inventing an hour', () => {
    const e = visitToEvent('a@b.org', visit({ IsTimeToBeDetermined: true, PrimaryDate: '12/31/2026 12:00:00 AM' }))!;
    expect(e.start).toEqual({ date: '2026-12-31' });
    expect(e.end).toEqual({ date: '2027-01-01' });
  });

  it('labels a video visit by how it happens, not by the clinic address', () => {
    expect(visitToEvent('a@b.org', visit({ Telemedicine: { IsTelemedicine: true, TelemedicineMode: 1 } }))!.location).toBe('Video visit');
  });

  it('skips canceled visits and visits with no handle', () => {
    expect(visitToEvent('a@b.org', visit({ status: 'canceled' }))).toBeNull();
    expect(isSyncableVisit(visit({ Csn: null }))).toBe(false);
    expect(isSyncableVisit(visit({ Csn: null, CsnForECheckIn: '7' }))).toBe(true);
  });
});

describe('eventId', () => {
  it('is stable per account + visit and only uses characters Google allows', () => {
    const id = eventId('tag1', visit());
    expect(id).toBe(eventId('tag1', visit()));
    expect(id).not.toBe(eventId('tag2', visit()));
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
  });
});
