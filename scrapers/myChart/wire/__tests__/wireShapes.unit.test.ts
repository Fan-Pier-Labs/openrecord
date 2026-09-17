/**
 * These assertions are for the compiler as much as the runner.
 *
 * `../shapes.ts` derives its types from the captured skeletons with mapped
 * types, so there is no generated artifact to drift — but the derivation can
 * still quietly stop doing its job: a `Splice` key the captures no longer carry
 * applies to nothing and says nothing about it, and a broken `Widen` would
 * leave literal types that satisfy most uses by accident.
 *
 * Each case below names a type through indexed access and assigns a value to
 * it. If the derivation breaks, the annotation stops accepting the value and
 * the build fails. They are written as declarations rather than property reads
 * on a cast `{}` on purpose — a read would pass the typecheck and then throw at
 * runtime on a container that isn't there.
 */

import { describe, expect, it } from 'bun:test';

import { rec, type Wire } from '../../processors/read';
import type {
  BillingGetVisits,
  LoadAllergies,
  ProxySwitch,
  VisitsLoadPast,
  VisitsLoadUpcoming,
} from '../shapes';

type UpcomingVisit = VisitsLoadUpcoming['LaterVisitsList'][number];
type PastVisit = VisitsLoadPast['List'][string]['List'][number];
type BilledVisit = BillingGetVisits['Data']['UnifiedVisitList'][number];

describe('wire shapes', () => {
  it('widens a captured literal back to the type it stands for', () => {
    // `''` in the skeleton means "a string was here", not the empty string.
    const dateOfBirth: LoadAllergies['dateOfBirth'] = 'any string, not just ""';
    const status: LoadAllergies['allergiesStatus'] = 42;
    const flag: LoadAllergies['hasUpdateSecurity'] = true;
    expect([dateOfBirth, status, flag]).toBeDefined();
  });

  it('widens an always-null leaf to unknown, not null', () => {
    // `null` in a skeleton records that we saw no value, so we know no type.
    // Were this `null`, reading it would look settled; `unknown` makes it a
    // decision. A non-null value has to be assignable for that to hold.
    const jump: UpcomingVisit['UnverifiedProxyJumpUrl'] = 'a value we never captured';
    expect(jump).toBeDefined();
  });

  it('widens an always-empty array to unknown[], not never[]', () => {
    // We have never seen an element, so we have no element shape. Under
    // `never[]` this assignment would not compile.
    const ids: ProxySwitch['ProxySubjectList'][number]['Ids'] = ['an element'];
    expect(ids).toHaveLength(1);
  });

  it('collapses an id-keyed map to a Record', () => {
    // `{ "*": T }` is the harness's marker for a map keyed by opaque ids.
    const listSize: VisitsLoadPast['List'][string]['ListSize'] = 10;
    expect(listSize).toBe(10);
  });

  it('splices the observed shapes into every bucket that repeats them', () => {
    // These containers were null on every captured instance, so without the
    // splice each would be `unknown` and none of these would compile. A visit
    // row repeats across the upcoming buckets and the past list, so the splice
    // has to reach all of them, not just the first.
    const isTelemedicine: UpcomingVisit['Telemedicine']['IsTelemedicine'] = true;
    const mode: UpcomingVisit['Telemedicine']['TelemedicineMode'] = 2;
    const isEVisit: UpcomingVisit['EVisit']['IsEVisit'] = false;
    const isPaid: UpcomingVisit['Copay']['IsPaid'] = true;
    const caseId: UpcomingVisit['Cases'][number]['CaseId'] = 'CASE-1';
    const csn: UpcomingVisit['ComponentVisits'][number]['Csn'] = 'CSN-1';
    const start: UpcomingVisit['AdmissionDateRange']['Start'] = '2026-01-01';
    const pastTelemedicine: PastVisit['Telemedicine']['IsTelemedicine'] = false;
    const estimate: BilledVisit['EstimateInfo']['EstimateAmount'] = '$0.00';
    expect([isTelemedicine, mode, isEVisit, isPaid, caseId, csn, start, pastTelemedicine, estimate])
      .toHaveLength(9);
  });

  it('keeps every leaf optional once read through Wire', () => {
    // The point of `rec<T>()` over `as T`: the field names are checked, the
    // values are not promised. `PrimaryDate` is `string | undefined` here, so
    // it cannot be used as a string without going through `text()`.
    const date: string | undefined = rec<VisitsLoadUpcoming>({}).LaterVisitsList?.[0]?.PrimaryDate;
    expect(date).toBeUndefined();
  });

  it('rejects a field no capture recorded', () => {
    const row: Wire<VisitsLoadUpcoming> = {};
    // @ts-expect-error nothing has ever observed this field
    const nope = row.MadeUpField;
    expect(nope).toBeUndefined();
  });
});
