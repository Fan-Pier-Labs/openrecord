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
  const ACCOUNT = 'pat@mychart.example.org';

  it('titles the event "Visit with" the provider and lasts the visit\'s duration', () => {
    const e = visitToEvent('tag1', ACCOUNT, visit())!;
    expect(e.summary).toBe('Visit with Dr. Example');
    expect(e.location).toBe('Example Clinic, 1 Main St, Springfield');
    expect(e.start).toEqual({ dateTime: '2026-12-01T15:00:00.000Z' });
    expect(e.end).toEqual({ dateTime: '2026-12-01T15:45:00.000Z' });
    expect(e.extendedProperties.private.openrecordAccount).toBe('tag1');
  });

  it('puts everything MyChart says about the visit in the description', () => {
    const e = visitToEvent('tag1', ACCOUNT, visit({
      ArrivalTime: '9:45 AM',
      EarlyArrivalReason: 'for paperwork',
      ChiefComplaint: 'Follow-up',
      OtherProviders: [{ Name: 'Example Nurse' }],
      Copay: { Amount: '$20.00', IsPaid: false },
      organizationName: 'Example Health',
      PrimaryDepartment: {
        Name: 'Example Clinic', Address: ['1 Main St', 'Springfield'], PhoneNumber: '555-0100',
        Specialty: { Title: 'Family Medicine' }, Instructions: [{ Text: 'Bring your insurance card.' }],
        ArrivalLocation: 'Second floor desk', TimeZone: null,
      },
    }))!;
    expect(e.description).toBe([
      'Visit type: Office Visit',
      'Provider: Dr. Example',
      'Also with: Example Nurse',
      'Reason for visit: Follow-up',
      'Department: Example Clinic (Family Medicine)',
      'Address: 1 Main St, Springfield',
      'Clinic phone: 555-0100',
      'Arrive by 9:45 AM (for paperwork).',
      'Check in at: Second floor desk',
      'Copay: $20.00',
      'Example Health',
      '',
      'Instructions:',
      'Bring your insurance card.',
      '',
      `Synced from MyChart (${ACCOUNT}) by OpenRecord. Edits here are overwritten on the next sync.`,
    ].join('\n'));
  });

  it('falls back to the department, then the visit type, for the title', () => {
    expect(visitToEvent('t', ACCOUNT, visit({ PrimaryProviderName: null }))!.summary).toBe('Visit with Example Clinic');
    const nowhere = visit({ PrimaryProviderName: null, PrimaryDepartment: { ...visit().PrimaryDepartment, Name: null, Address: [] } });
    expect(visitToEvent('t', ACCOUNT, nowhere)!.summary).toBe('Office Visit');
  });

  it('fills the location from the organization when MyChart gives no clinic', () => {
    const v = visit({ organizationName: 'Example Health', PrimaryDepartment: { ...visit().PrimaryDepartment, Name: null, Address: [] } });
    expect(visitToEvent('t', ACCOUNT, v)!.location).toBe('Example Health');
  });

  it('defaults to 30 minutes when MyChart gives no duration', () => {
    const e = visitToEvent('t', ACCOUNT, visit({ DurationInMinutes: null }))!;
    expect(e.end).toEqual({ dateTime: '2026-12-01T15:30:00.000Z' });
  });

  it('puts a visit with no clock time on its day', () => {
    const e = visitToEvent('t', ACCOUNT, visit({ IsTimeToBeDetermined: true, PrimaryDate: '12/31/2026 12:00:00 AM' }))!;
    expect(e.start).toEqual({ date: '2026-12-31' });
    expect(e.end).toEqual({ date: '2027-01-01' });
  });

  it('says "Video visit" for telemedicine', () => {
    const e = visitToEvent('t', ACCOUNT, visit({ Telemedicine: { IsTelemedicine: true, TelemedicineMode: 1 } }))!;
    expect(e.location).toBe('Video visit');
    expect(e.description).toContain('Video visit: join from MyChart.');
  });

  it('leaves off canceled visits and visits with no handle', () => {
    expect(visitToEvent('t', ACCOUNT, visit({ status: 'canceled' }))).toBeNull();
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
