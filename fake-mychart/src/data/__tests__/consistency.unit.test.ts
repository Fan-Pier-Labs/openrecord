import { describe, it, expect } from 'bun:test';
import { conformToShape } from '../../lib/shape';
import * as shapes from '../realShapes';
import * as homer from '../homer';

/**
 * One fact, one value — across endpoints.
 *
 * `visits.unit.test.ts` guards a visit row against itself. This guards the
 * places where two endpoints describe the same thing and used to disagree:
 * a flag that denied content the fake was holding, an id that changed between
 * endpoints, a balance that ignored its own payment. Every case here was a
 * real finding against the fixture, and none of them is something
 * `conformToShape` can catch — a wrong value conforms exactly as well as a
 * right one.
 */

/** The CSNs `get_visit_notes` can actually answer for. */
const CSNS_WITH_NOTES = Object.keys(homer.visitNotesByCsn);

function allVisits(): Record<string, unknown>[] {
  const upcomingShape = shapes.visitsLoadUpcoming;
  const upcoming = conformToShape(upcomingShape, homer.upcomingVisits) as {
    InProgressVisits: Record<string, unknown>[];
    NextNDaysVisits: Record<string, unknown>[];
    LaterVisitsList: Record<string, unknown>[];
  };
  const visitShape = shapes.visitsLoadPast.List['*'].List[0];
  const past = homer.pastVisits.PastVisitsList.map((v) => conformToShape(visitShape, v) as Record<string, unknown>);
  return [...upcoming.InProgressVisits, ...upcoming.NextNDaysVisits, ...upcoming.LaterVisitsList, ...past];
}

describe('homer fixture, across endpoints', () => {
  it('flags a visit as having a clinical note exactly when the notes fixture holds one', () => {
    expect(CSNS_WITH_NOTES.length).toBeGreaterThan(0);
    for (const visit of allVisits()) {
      // A consumer gates get_visit_notes on this flag, so a false here for a
      // CSN the fake will happily answer for reports "no notes on file" for a
      // patient who has them.
      expect({ csn: visit.Csn, hasNote: visit.IsClinicalNoteAvailable }).toEqual({
        csn: visit.Csn,
        hasNote: CSNS_WITH_NOTES.includes(visit.Csn as string),
      });
    }
  });

  it('gives Nick Riviera one provider id everywhere he appears', () => {
    const careTeamEntry = homer.careTeam.ProvidersList.find((p) => p.Name === 'Nick Riviera, MD');
    expect(careTeamEntry).toBeDefined();
    // Joining the care team to a message recipient on provider id has to work,
    // and the messaging fixture is the side with more references.
    expect(careTeamEntry!.ID).toBe('PROV-NICK');
  });

  it('names the family-history relative in the name field, not inside the status', () => {
    for (const member of homer.medicalHistory.familyHistoryAndStatus.familyMembers) {
      expect(member.nameOrAlias).not.toBe('');
      // "Abraham Simpson - Living" in statusName leaves a caller reading
      // nameOrAlias reporting that the relative has no name on file.
      expect(member.statusName).not.toContain(member.nameOrAlias);
    }
  });

  it('flags an imaging study abnormal when its impression describes a finding', () => {
    const impressions = [homer.imagingLabResultDetails, homer.ctLabResultDetails]
      .map((d) => ({ name: d.orderName, text: d.results[0]!.studyResult.impression.contentAsString }));
    expect(impressions).toHaveLength(2);

    for (const { name, text } of impressions) {
      expect(text).toMatch(/foreign bod/i);
      const listed = Object.values(homer.imagingLabResultsList.newResults).find((r) => r.name === name);
      // A present-and-false flag is worse than an absent one: a triage layer
      // filtering on isAbnormal drops a study recommending follow-up.
      expect({ name, isAbnormal: listed?.isAbnormal }).toEqual({ name, isAbnormal: true });
    }
  });

  it('records a next visit in the health summary when one is scheduled', () => {
    const upcoming = homer.upcomingVisits.LaterVisitsList[0]!;
    const [month, day, year] = (upcoming.PrimaryDate as string).split(' ')[0]!.split('/');
    expect(homer.healthSummaryHeader.nextVisit.date).toBe(`${month}/${day}/${year}`);
    expect(homer.healthSummaryHeader.nextVisit.visitType).toBe(upcoming.VisitTypeName);
  });

  it('applies the visit payment to the visit balance, and to the guarantor total', () => {
    const dollars = (v: string) => Number(v.replace(/[$,]/g, ''));
    const visit = homer.billingVisits.Data.InformationalVisitList[0]!;

    // Charged, less the insurance portion, less what the patient has paid.
    expect(dollars(visit.ChargeAmount) - dollars(visit.InsuranceAmountDue) - dollars(visit.SelfPaymentAmount))
      .toBe(dollars(visit.SelfAmountDue));
    // The procedure lines have to add up to the visit they belong to.
    expect(visit.ProcedureList.reduce((sum, line) => sum + dollars(line.SelfAmountDue), 0))
      .toBe(dollars(visit.SelfAmountDue));
    // And the only outstanding visit is the guarantor's whole balance.
    expect(dollars(homer.billingSummary[0]!.amountDue)).toBe(dollars(visit.SelfAmountDue));
  });

  it('names the most recent payment in the "last paid" line', () => {
    // The line used to name a payment the payment list did not hold.
    const newest = homer.billingPayments.Data.PaymentList
      .map((p) => ({ ...p, on: new Date(p.Year, p.Month - 1, p.DayOfMonth).valueOf() }))
      .sort((a, b) => b.on - a.on)[0]!;
    const { lastPaid } = homer.billingSummary[0]!;
    expect(lastPaid).toContain(newest.PaymentAmountDisplay);
    expect(lastPaid).toContain(
      `${String(newest.Month).padStart(2, '0')}/${String(newest.DayOfMonth).padStart(2, '0')}/${newest.Year}`,
    );
  });

  it('backs every numeric goal reading with a flowsheet reading of the same value', () => {
    const readings = homer.vitalsReadings.flowsheet.readings;
    const weightGoal = homer.careTeamGoals.careTeamGoals.find((g) => g.title === 'Lose 50 lbs')!;
    for (const reading of weightGoal.readings) {
      // A goal reading with nothing behind it in Track My Health is the fixture
      // holding a number in one endpoint and denying it in another.
      const day = reading.instantTakenIso.slice(0, 10);
      const match = readings.find((r) => r.rowId === 'row-wt' && r.instantTakenIso.startsWith(day));
      // Track My Health stores weight in ounces beside a `lbs` display unit
      // (verified on a real instance); the goal reading's unit is uncaptured
      // and the fixture keeps it in pounds.
      expect({ day, value: match && match.numericValue / 16 }).toEqual({ day, value: reading.numericValue });
    }
  });

  it('types every numeric reading as a number, in every endpoint that has one', () => {
    for (const goal of homer.careTeamGoals.careTeamGoals) {
      for (const reading of goal.readings) expect(typeof reading.numericValue).toBe('number');
    }
    for (const reading of homer.vitalsReadings.flowsheet.readings) {
      if ('numericValue' in reading) expect(typeof reading.numericValue).toBe('number');
    }
  });

  it('puts every clinical timestamp in one time zone', () => {
    const zones = new Set<string>();
    for (const reading of homer.vitalsReadings.flowsheet.readings) zones.add(reading.timeZone);
    for (const visit of allVisits()) zones.add(visit.TimeZone as string);
    expect([...zones]).toEqual(['America/New_York']);
  });

  it('gives the patient exactly one primary emergency contact, at their own address', () => {
    const contacts = homer.emergencyContacts.contacts;
    expect(contacts.filter((c) => c.isPrimaryContact)).toHaveLength(1);
    const streets = contacts.map((c) => c.contactInformation.address.street);
    // Every contact used to carry the patient's own street.
    expect(new Set(streets).size).toBe(streets.length);
  });

  it('serves the patient the address and phone numbers it hands out elsewhere', () => {
    expect(homer.contactInfo.PermanentAddress.Success).toBe(true);
    expect(homer.contactInfo.PermanentAddress.Street).toBe(homer.HOMER_ADDRESS[0]);
    expect(homer.contactInfo.HomePhone).not.toBe('');
    expect(homer.contactInfo.WorkPhone).not.toBe('');
  });

  it('starts the vitals flowsheet no later than its oldest reading', () => {
    const oldest = homer.vitalsReadings.flowsheet.readings
      .map((r) => r.instantTakenIso.slice(0, 10)).sort()[0]!;
    expect(homer.vitals.flowsheets[0]!.startDateIso <= oldest).toBe(true);
  });
});
