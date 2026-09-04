/**
 * The shared "what am I searching for" resolution, and the bookable window a
 * client needs before it can ask someone when they want to be seen.
 */
import { describe, expect, it } from 'bun:test';

import { createMockRequest, htmlResponse, jsonResponse, pageWithCsrfToken } from '../../auth/__tests__/mockMyChartRequest';
import { parseSchedulingWindow, resolveSchedulingContext, windowDates } from '../schedulingContext';

const workflow = {
  WorkflowSettings: { FromDaysOffset: 0, ToDaysOffset: 400, NewProvFromDaysOffset: 2, NewProvToDaysOffset: 90 },
  Specialties: [
    { Id: 'SPEC-1', Name: 'Primary Care' },
    { Id: 'SPEC-2', Name: 'Cardiology' },
  ],
};

const specialtyData = {
  ProviderDepartmentPairs: [{ ProviderId: 'PROV-1', DepartmentId: 'DEPT-1' }, { ProviderId: 'bad' }],
  ReasonsForVisit: [
    { Id: 'RFV-req', Title: 'Request Only', CanDirectSchedule: false, DefaultVisitTypeId: 'VT-1' },
    { Id: 'RFV-ok', Title: 'New Patient', CanDirectSchedule: true, DefaultVisitTypeId: 'VT-2' },
  ],
  VisitTypes: [{ ID: 'VT-1' }, { ID: 'VT-2', AnonymousSchedulingDecisionTreeId: 'TREE-9' }],
};

const mock = () =>
  createMockRequest(
    {
      '/OpenScheduling': () => htmlResponse(pageWithCsrfToken('tok')),
      '/Scheduling/Anonymous/GetSchedulingWorkflowData': () => jsonResponse(workflow),
      '/Scheduling/Anonymous/GetSpecialtyData': () => jsonResponse(specialtyData),
    },
    { firstPathPart: 'MyChart-SGH' },
  ).req;

describe('parseSchedulingWindow', () => {
  it('prefers the new-provider offsets, which is the workflow this page runs', () => {
    expect(parseSchedulingWindow(workflow.WorkflowSettings)).toEqual({
      earliestDaysOut: 2,
      latestDaysOut: 90,
      explicit: true,
    });
  });

  it('falls back to the general offsets when the org sets no new-provider pair', () => {
    expect(parseSchedulingWindow({ FromDaysOffset: 1, ToDaysOffset: 30 })).toEqual({
      earliestDaysOut: 1,
      latestDaysOut: 30,
      explicit: true,
    });
  });

  it('says so when it is guessing rather than reporting', () => {
    expect(parseSchedulingWindow(null)).toEqual({ earliestDaysOut: 0, latestDaysOut: 365, explicit: false });
  });
});

describe('windowDates', () => {
  it('turns day offsets into the dates a picker would show', () => {
    const { earliest, latest } = windowDates({ earliestDaysOut: 2, latestDaysOut: 5, explicit: true }, new Date(2026, 8, 8));
    expect(earliest.getDate()).toBe(10);
    expect(latest.getDate()).toBe(13);
  });

  it('lands on the right day across a daylight-saving change', () => {
    // Any window wider than a few weeks crosses one twice a year; adding
    // 86_400_000 ms per day lands an hour off and drops a date.
    const { latest } = windowDates({ earliestDaysOut: 0, latestDaysOut: 90, explicit: true }, new Date(2026, 9, 1));
    const expected = new Date(2026, 9, 1 + 90);
    expect(latest.getFullYear()).toBe(expected.getFullYear());
    expect(latest.getMonth()).toBe(expected.getMonth());
    expect(latest.getDate()).toBe(expected.getDate());
    // Midnight local, not 23:00 the previous evening.
    expect(latest.getHours()).toBe(0);
  });

  it('is stable across a spring-forward too', () => {
    const { latest } = windowDates({ earliestDaysOut: 0, latestDaysOut: 60, explicit: true }, new Date(2027, 1, 15));
    expect(latest.getHours()).toBe(0);
    expect(latest.getDate()).toBe(new Date(2027, 1, 15 + 60).getDate());
  });
});

describe('resolveSchedulingContext', () => {
  it('resolves the default specialty, reason, visit type and its tree', async () => {
    const context = await resolveSchedulingContext(mock());
    expect(context.specialty).toEqual({ id: 'SPEC-1', name: 'Primary Care' });
    // The request-only reason is skipped for the directly schedulable one.
    expect(context.reason?.Id).toBe('RFV-ok');
    expect(context.visitTypeId).toBe('VT-2');
    expect(context.treeId).toBe('TREE-9');
    expect(context.window.latestDaysOut).toBe(90);
  });

  it('drops a malformed pair rather than sending it', async () => {
    expect((await resolveSchedulingContext(mock())).pairs).toEqual([{ ProviderId: 'PROV-1', DepartmentId: 'DEPT-1' }]);
  });

  it('refuses an unknown specialty or reason with the list the instance publishes', async () => {
    await expect(resolveSchedulingContext(mock(), { specialty: 'Podiatry' })).rejects.toThrow(
      /no specialty named .*Podiatry.* it lists Primary Care, Cardiology/,
    );
    await expect(resolveSchedulingContext(mock(), { reasonForVisit: 'Annual' })).rejects.toThrow(
      /no reason for visit named .*Annual.* it lists Request Only, New Patient/,
    );
  });
});
