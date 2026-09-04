// Chart data for the patient records Homer has proxy access to — his children.
//
// Real MyChart scopes every endpoint to whichever record the session is
// currently in: switch to a child and the medication list, allergies, labs and
// everything else become that child's. Returning the account holder's data
// while in a child's chart is the single worst failure this app can produce, so
// each record here carries its own dataset and anything not modelled comes back
// structurally empty rather than falling through to Homer's.
//
// All fictional. Ages are as of 2026.

import type { PatientDatasetOverrides } from '@/lib/dataset';
import type { FakeUserProfile } from '@/lib/state';

/**
 * Epic proxy-subject ids are long opaque `WP-` strings — 84-90 characters on
 * the instances we've seen (UCSF, Renown, Carson Tahoe). They are NOT short
 * slugs and they are NOT stable across organizations, so nothing may parse or
 * construct them; they are only ever echoed back as the `eid` query parameter.
 * These are synthetic but length- and shape-realistic.
 */
export const BART_PROXY_ID = 'WP-7NQK4XZC2VJH8RTLM3PWY6BDF9SGA5EU1KXNQZ7RVJM2HTCBW4YLDP8FGS3AKEN6QRXZ9UVJ5MTHW2C';
export const LISA_PROXY_ID = 'WP-3MFTJ9WQ2XKVN7RBZ5HLC8PYDA4GSEU6KMWJ1QRXTV9NZBHFC2LPD7YSGA5EK3UNQXWRJ8MVTZ6HC4';
export const MAGGIE_PROXY_ID = 'WP-9XVKZ2QM7WTNJ5RBH3LFC8PYDA6GSEU4KMWJ1QRXTV2NZBHFC9LPD5YSGA7EK3UNQXWRJ4MVTZ8HC6';

export type KidRecord = {
  id: string;
  /** Short name as it appears in the proxy dropdown — NOT the legal name. */
  displayName: string;
  profile: FakeUserProfile;
  dataset: PatientDatasetOverrides;
};

const PEDIATRICIAN = 'Dr. Julius Hibbert, MD';
const PEDIATRICIAN_SHORT = 'Julius Hibbert, MD';
// The same provider entry on all three kids' care teams, as one pediatrician
// serving a family looks on a real instance.
const PEDIATRICIAN_PROVIDER = {
  ID: 'PROV-HIBBERT',
  Name: PEDIATRICIAN_SHORT,
  NationalProviderID: '1000000001',
  Relation: 'Primary Care Provider',
  Specialty: 'Pediatrics',
  DepartmentID: 'DEP-PEDS-1',
  CanMessage: true,
};

const SPRINGFIELD_PHARMACY = {
  name: 'Kwik-E-Mart Pharmacy',
  phoneNumber: '(555) 636-2700',
  formattedAddress: ['742 Evergreen Terrace', 'Springfield, NT 49007'],
};

function immunizations(entries: { name: string; id: string; formattedAdministeredDates: string[] }[]) {
  return {
    organizationImmunizationList: [
      {
        organization: { organizationName: 'Springfield General Hospital' },
        orgImmunizations: entries,
      },
    ],
  };
}

// ─── Bart ─────────────────────────────────────────────────────────────
// Age 12. The record with the most going on: asthma plus a stack of injuries.

const bart: KidRecord = {
  id: BART_PROXY_ID,
  displayName: 'Bart Simpson',
  profile: {
    name: 'Bartholomew JoJo Simpson',
    dob: '04/01/2014',
    mrn: '744',
    pcp: PEDIATRICIAN,
  },
  dataset: {
    medications: {
      communityMembers: [
        {
          prescriptionList: {
            prescriptions: [
              {
                name: 'Albuterol Sulfate HFA 90mcg Inhaler',
                medicationKey: 'FAKE-MED-KEY-101',
                // The captured skeleton's id; medicationKey above is the fake's own guess (docs/processor-layer-todo.md §2).
                id: 'FAKE-MED-KEY-101',
                patientFriendlyName: { text: 'Albuterol Inhaler' },
                sig: 'Inhale 2 puffs by mouth every 4 hours as needed for wheezing',
                dateToDisplay: '02/03/2026',
                startDate: '02/03/2026',
                authorizingProvider: { name: PEDIATRICIAN_SHORT },
                orderingProvider: { name: PEDIATRICIAN_SHORT },
                isPatientReported: false,
                refillDetails: {
                  writtenDispenseQuantity: '1',
                  daySupply: '30',
                  isRefillable: true,
                  owningPharmacy: SPRINGFIELD_PHARMACY,
                },
              },
              {
                name: 'Amoxicillin 250mg/5mL Suspension',
                medicationKey: 'FAKE-MED-KEY-102',
                // The captured skeleton's id; medicationKey above is the fake's own guess (docs/processor-layer-todo.md §2).
                id: 'FAKE-MED-KEY-102',
                patientFriendlyName: { text: 'Amoxicillin' },
                sig: 'Take 5 mL by mouth three times daily for 10 days',
                dateToDisplay: '01/22/2026',
                startDate: '01/22/2026',
                authorizingProvider: { name: PEDIATRICIAN_SHORT },
                orderingProvider: { name: PEDIATRICIAN_SHORT },
                isPatientReported: false,
                refillDetails: {
                  writtenDispenseQuantity: '150',
                  daySupply: '10',
                  isRefillable: false,
                  owningPharmacy: SPRINGFIELD_PHARMACY,
                },
              },
            ],
          },
        },
      ],
      getPatientFirstName: 'Bart',
    },
    allergies: {
      dataList: [
        {
          allergyItem: {
            name: 'Penicillin',
            id: 'ALLERGY-BART-001',
            formattedDateNoted: '06/12/2019',
            type: 'Drug',
            reaction: 'Rash',
            severity: 'Moderate',
          },
        },
      ],
      allergiesStatus: 0,
    },
    healthIssues: {
      dataList: [
        { healthIssueItem: { name: 'Asthma, mild intermittent', id: 'HI-BART-001', formattedDateNoted: '09/04/2019', isReadOnly: false } },
        { healthIssueItem: { name: 'Attention deficit hyperactivity disorder', id: 'HI-BART-002', formattedDateNoted: '03/18/2021', isReadOnly: false } },
        { healthIssueItem: { name: 'History of repeated fractures', id: 'HI-BART-003', formattedDateNoted: '11/02/2022', isReadOnly: false } },
      ],
    },
    healthSummary: {
      header: {
        patientAge: '12',
        height: { value: "4' 9\"", dateRecorded: '02/03/2026' },
        weight: { value: '84 lbs', dateRecorded: '02/03/2026' },
        bloodType: 'O+',
      },
      patientFirstName: 'Bart',
    },
    healthSummaryHeader: {
      lastVisit: { date: '02/03/2026', visitType: 'Asthma Follow-up' },
    },
    immunizations: immunizations([
      { name: 'Influenza (Flu)', id: 'IMM-BART-001', formattedAdministeredDates: ['10/08/2025', '10/11/2024'] },
      { name: 'MMR', id: 'IMM-BART-002', formattedAdministeredDates: ['04/20/2015', '05/02/2018'] },
      { name: 'DTaP', id: 'IMM-BART-003', formattedAdministeredDates: ['06/01/2014', '08/01/2014', '10/01/2014', '04/15/2015', '05/02/2018'] },
      { name: 'Varicella', id: 'IMM-BART-004', formattedAdministeredDates: ['04/20/2015'] },
    ]),
    careTeam: {
      ProvidersList: [
        PEDIATRICIAN_PROVIDER,
        { ID: 'PROV-RAMIREZ', Name: 'Dr. Corazon Ramirez, MD', NationalProviderID: '1000000004', Relation: 'Specialist', Specialty: 'Pediatric Pulmonology', DepartmentID: 'DEP-PULM-1', CanMessage: true },
      ],
      DescriptiveTitle: 'Your Care Team',
      TabColorClass: 'tab-01',
      CustomRequestAppointmentLink: '/MyChart/scheduling/request',
    },
    // A child's coverage: the parent is the subscriber, so `SubscriberIsSelf`
    // is false and the member id is the dependent's, not the subscriber's.
    insurance: {
      ActiveCoverages: [
        {
          CoverageId: 'WP-COVERAGE-SNPP-02',
          CoverageName: 'Springfield Nuclear Power Plant Employee Health Plan (PPO)',
          Status: 1,
          CoverageType: 1,
          PayorName: 'Springfield Mutual Health',
          PlanName: 'SNPP Employee PPO',
          SubscriberId: 'HSJ-12345',
          SubscriberName: 'Homer J Simpson',
          SubscriberIsSelf: false,
          MemberId: 'HSJ-12345-02',
          MemberName: 'Bart J Simpson',
          GroupNumber: 'SNPP-742',
          FormattedEffectiveDate: '01/01/2026',
          Future: false,
          Termed: false,
        },
      ],
      // No pending coverage on a child's record: the parent's is the one with
      // something mid-workflow.
      CoveragesPendingSubmission: [],
      Settings: {
        IsStandAlone: true,
        CanUpdate: true,
        CanViewDetails: true,
        CanPayPremium: false,
        CanViewInsHub: true,
        IsInsHubOn: true,
      },
    },
  },
};

// ─── Lisa ─────────────────────────────────────────────────────────────
// Age 10. A deliberately sparse record: no medications, no allergies. Proves
// that "empty" is returned as empty rather than falling back to a fuller chart.

const lisa: KidRecord = {
  id: LISA_PROXY_ID,
  displayName: 'Lisa Simpson',
  profile: {
    name: 'Lisa Marie Simpson',
    dob: '05/09/2016',
    mrn: '745',
    pcp: PEDIATRICIAN,
  },
  dataset: {
    healthIssues: {
      dataList: [
        { healthIssueItem: { name: 'Vegetarian diet, nutritional counseling', id: 'HI-LISA-001', formattedDateNoted: '02/14/2023', isReadOnly: false } },
      ],
    },
    healthSummary: {
      header: {
        patientAge: '10',
        height: { value: "4' 4\"", dateRecorded: '01/28/2026' },
        weight: { value: '62 lbs', dateRecorded: '01/28/2026' },
        bloodType: 'A+',
      },
      patientFirstName: 'Lisa',
    },
    healthSummaryHeader: {
      lastVisit: { date: '01/28/2026', visitType: 'Well Child Visit' },
    },
    immunizations: immunizations([
      { name: 'Influenza (Flu)', id: 'IMM-LISA-001', formattedAdministeredDates: ['10/08/2025', '10/11/2024'] },
      { name: 'MMR', id: 'IMM-LISA-002', formattedAdministeredDates: ['06/14/2017', '07/01/2020'] },
      { name: 'DTaP', id: 'IMM-LISA-003', formattedAdministeredDates: ['07/09/2016', '09/09/2016', '11/09/2016', '06/14/2017', '07/01/2020'] },
      { name: 'HPV', id: 'IMM-LISA-004', formattedAdministeredDates: ['01/28/2026'] },
    ]),
    careTeam: {
      ProvidersList: [
        PEDIATRICIAN_PROVIDER,
      ],
      DescriptiveTitle: 'Your Care Team',
      TabColorClass: 'tab-01',
      CustomRequestAppointmentLink: '/MyChart/scheduling/request',
    },
    // A child's coverage: the parent is the subscriber, so `SubscriberIsSelf`
    // is false and the member id is the dependent's, not the subscriber's.
    insurance: {
      ActiveCoverages: [
        {
          CoverageId: 'WP-COVERAGE-SNPP-03',
          CoverageName: 'Springfield Nuclear Power Plant Employee Health Plan (PPO)',
          Status: 1,
          CoverageType: 1,
          PayorName: 'Springfield Mutual Health',
          PlanName: 'SNPP Employee PPO',
          SubscriberId: 'HSJ-12345',
          SubscriberName: 'Homer J Simpson',
          SubscriberIsSelf: false,
          MemberId: 'HSJ-12345-03',
          MemberName: 'Lisa M Simpson',
          GroupNumber: 'SNPP-742',
          FormattedEffectiveDate: '01/01/2026',
          Future: false,
          Termed: false,
        },
      ],
      // No pending coverage on a child's record: the parent's is the one with
      // something mid-workflow.
      CoveragesPendingSubmission: [],
      Settings: {
        IsStandAlone: true,
        CanUpdate: true,
        CanViewDetails: true,
        CanPayPremium: false,
        CanViewInsHub: true,
        IsInsHubOn: true,
      },
    },
  },
};

// ─── Maggie ───────────────────────────────────────────────────────────
// Age 2. Infant record: a long immunization schedule and nothing else.

const maggie: KidRecord = {
  id: MAGGIE_PROXY_ID,
  displayName: 'Maggie Simpson',
  profile: {
    name: 'Margaret Evelyn Simpson',
    dob: '01/12/2024',
    mrn: '746',
    pcp: PEDIATRICIAN,
  },
  dataset: {
    healthSummary: {
      header: {
        patientAge: '2',
        height: { value: "2' 11\"", dateRecorded: '01/15/2026' },
        weight: { value: '27 lbs', dateRecorded: '01/15/2026' },
        bloodType: 'O+',
      },
      patientFirstName: 'Maggie',
    },
    healthSummaryHeader: {
      lastVisit: { date: '01/15/2026', visitType: '2 Year Well Child Visit' },
    },
    immunizations: immunizations([
      { name: 'Hepatitis B', id: 'IMM-MAGGIE-001', formattedAdministeredDates: ['01/12/2024', '02/16/2024', '07/19/2024'] },
      { name: 'DTaP', id: 'IMM-MAGGIE-002', formattedAdministeredDates: ['03/15/2024', '05/17/2024', '07/19/2024'] },
      { name: 'Rotavirus', id: 'IMM-MAGGIE-003', formattedAdministeredDates: ['03/15/2024', '05/17/2024'] },
      { name: 'MMR', id: 'IMM-MAGGIE-004', formattedAdministeredDates: ['01/15/2026'] },
      { name: 'Varicella', id: 'IMM-MAGGIE-005', formattedAdministeredDates: ['01/15/2026'] },
    ]),
    careTeam: {
      ProvidersList: [
        PEDIATRICIAN_PROVIDER,
      ],
      DescriptiveTitle: 'Your Care Team',
      TabColorClass: 'tab-01',
      CustomRequestAppointmentLink: '/MyChart/scheduling/request',
    },
    // A child's coverage: the parent is the subscriber, so `SubscriberIsSelf`
    // is false and the member id is the dependent's, not the subscriber's.
    insurance: {
      ActiveCoverages: [
        {
          CoverageId: 'WP-COVERAGE-SNPP-04',
          CoverageName: 'Springfield Nuclear Power Plant Employee Health Plan (PPO)',
          Status: 1,
          CoverageType: 1,
          PayorName: 'Springfield Mutual Health',
          PlanName: 'SNPP Employee PPO',
          SubscriberId: 'HSJ-12345',
          SubscriberName: 'Homer J Simpson',
          SubscriberIsSelf: false,
          MemberId: 'HSJ-12345-04',
          MemberName: 'Maggie Simpson',
          GroupNumber: 'SNPP-742',
          FormattedEffectiveDate: '01/01/2026',
          Future: false,
          Termed: false,
        },
      ],
      // No pending coverage on a child's record: the parent's is the one with
      // something mid-workflow.
      CoveragesPendingSubmission: [],
      Settings: {
        IsStandAlone: true,
        CanUpdate: true,
        CanViewDetails: true,
        CanPayPremium: false,
        CanViewInsHub: true,
        IsInsHubOn: true,
      },
    },
  },
};

/** The records Homer has proxy access to, in the order MyChart lists them. */
export const HOMER_PROXY_RECORDS: KidRecord[] = [bart, lisa, maggie];
