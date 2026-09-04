/**
 * `encodeForm` — the encoding MyChart's own page JS (`$$WPUtil.postify`) uses.
 *
 * These assertions exist because the first version emitted jQuery's
 * `outer[inner]` instead of Epic's `outer.inner`. `GetSchedulingWorkflowData`
 * binds either form, so the bug was invisible on the instance it was written
 * against, and `GetSlots` answered 500 on roughly two in five instances.
 * Confirmed by replaying one captured body in both encodings against a live
 * instance: dots 200, brackets 500, nothing else changed.
 */
import { describe, expect, it } from 'bun:test';

import { encodeForm } from '../preloginSession';

/** Read back as pairs — assertions here are about key syntax, not escaping. */
const keys = (data: Record<string, unknown>) => [...new URLSearchParams(encodeForm(data)).keys()];

describe('encodeForm', () => {
  it('joins nested object properties with a dot, not brackets', () => {
    expect(encodeForm({ schedulingParameters: { workflow: 'NewProvider' } })).toBe(
      'schedulingParameters.workflow=NewProvider',
    );
  });

  it('uses brackets for array indices and a dot for fields inside them', () => {
    expect(keys({ appointmentBuilder: { Appointments: [{ VisitTypeId: 'VT-1' }] } })).toEqual([
      'appointmentBuilder.Appointments[0].VisitTypeId',
    ]);
  });

  it('nests to the depth the slot search actually sends', () => {
    // The exact shape of a GetSlots body, which is where the bug showed up.
    expect(
      keys({ appointmentBuilder: { Appointments: [{ ProviderDepartmentPairs: [{ ProviderId: 'P1' }, { ProviderId: 'P2' }] }] } }),
    ).toEqual([
      'appointmentBuilder.Appointments[0].ProviderDepartmentPairs[0].ProviderId',
      'appointmentBuilder.Appointments[0].ProviderDepartmentPairs[1].ProviderId',
    ]);
  });

  it('renders primitives the way the page serializer does', () => {
    expect(encodeForm({ isFirstLoad: true, startDte: 67821, name: 'plain' })).toBe(
      'isFirstLoad=true&startDte=67821&name=plain',
    );
  });

  it('omits null and undefined rather than sending the word "null"', () => {
    expect(encodeForm({ a: null, b: undefined, c: 'kept' })).toBe('c=kept');
  });

  it('keeps an empty string, which the live payload uses for an unset slot', () => {
    expect(encodeForm({ appointmentBuilder: { Appointments: [{ Slot: '' }] } })).toBe(
      'appointmentBuilder.Appointments%5B0%5D.Slot=',
    );
  });
});
