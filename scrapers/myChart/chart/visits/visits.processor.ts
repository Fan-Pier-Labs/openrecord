/**
 * Visits processors. Field decisions: docs/processor-layer-proposal.md,
 * `get_upcoming_visits` and `get_past_visits`.
 *
 * Both endpoints return the same ~160-field visit view model, so one
 * `visitStandard` mapper serves both. `LoadUpcoming` answers three buckets
 * (in progress / next N days / later) which are flattened into one list with
 * `bucket` on each row; `LoadPast` answers one page per organization and the
 * scraper records every page, so the per-organization merge happens here.
 *
 * `status` is derived from the seven status booleans in most-specific-first
 * order (PR #380): a canceled visit reported as "completed" is a lie about
 * care the patient never received. `IsPastVisit` is never consulted — it is
 * false on rows `LoadPast` itself returned (#377).
 */

import { findRequest, findRequests, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { bool, boolOrNull, epicInstantMs, isoFromMs, list, num, rec, strings, text, textOrNull } from '../../processors/read';

export type VisitStatus =
  | 'canceled'
  | 'no_show'
  | 'left_without_being_seen'
  | 'in_progress'
  | 'arrived'
  | 'completed'
  | 'cancel_requested'
  | 'confirmed'
  | 'scheduled';

export type VisitBucket = 'in_progress' | 'soon' | 'later';

export interface VisitDiagnosisStandard {
  Code: string | null;
  Description: string | null;
}

export interface VisitProcedureStandard {
  Name: string | null;
  Instructions: string | null;
  Providers: Array<{ Name: string | null }>;
}

export interface VisitProviderStandard {
  Name: string | null;
  Department: { Name: string | null; Address: string[]; PhoneNumber: string | null } | null;
}

export interface VisitDepartmentStandard {
  Name: string | null;
  Address: string[];
  PhoneNumber: string | null;
  Specialty: { Title: string | null };
  Instructions: Array<{ Text: string | null }>;
  ArrivalLocation: string | null;
  TimeZone: string | null;
}

export interface VisitPreadmissionLocationStandard {
  Name: string | null;
  Address: string[];
  PhoneNumber: string | null;
  Instructions: Array<{ Text: string | null }>;
  ArrivalLocation: string | null;
}

export interface VisitStandard {
  // Handles
  Csn: string | null;
  CsnForECheckIn: string | null;
  Id: string | null;
  ReferenceID: string | null;
  // When
  Instant: string | null;
  /** Derived: `Instant` as ISO-8601 UTC. */
  instantISO: string | null;
  PrimaryDate: string | null;
  TimeZone: string | null;
  IsTimeToBeDetermined: boolean | null;
  IsHideVisitTime: boolean | null;
  DurationInMinutes: number | null;
  HasDuration: boolean | null;
  ArrivalTime: string | null;
  EarlyArrivalReason: string | null;
  AdmissionDateRange: { Start: string | null; End: string | null } | null;
  DischargeDate: string | null;
  RescheduledDatString: string | null;
  // What
  VisitTypeName: string | null;
  IsUsingFallbackVisitTypeName: boolean | null;
  EncounterType: number | null;
  EncounterIsSurgery: boolean | null;
  EncounterIsEDVisit: boolean | null;
  IsPreadmission: boolean | null;
  IsHovPreadmission: boolean | null;
  IsResidentialMed: boolean | null;
  ChiefComplaint: string | null;
  Diagnoses: VisitDiagnosisStandard[];
  SurgicalProcedures: VisitProcedureStandard[];
  Cases: Array<{ CaseId: string | null; Description: string | null }>;
  ComponentVisits: Array<{ Csn: string | null; VisitTypeName: string | null; PrimaryDate: string | null }>;
  HasComponentVisits: boolean | null;
  PatientNextStepInstructions: string | null;
  EpisodeDetails: { GestationalAge: string | null };
  /** A number on one release and a string on the other. */
  SurgeryTimeOfDay: string | number | null;
  // Who
  PrimaryProviderName: string | null;
  PrimaryProvider: { Name: string | null } | null;
  Providers: VisitProviderStandard[];
  OtherProviders: Array<{ Name: string | null }>;
  GuestPatientFirstName: string | null;
  // Where
  PrimaryDepartment: VisitDepartmentStandard;
  PreadmissionLocation: VisitPreadmissionLocationStandard | null;
  /** Derived: `Organization.OrganizationName` lifted onto the row. */
  organizationName: string | null;
  // Status
  IsCanceled: boolean | null;
  IsNoShow: boolean | null;
  LeftWithoutSeen: boolean | null;
  InProgress: boolean | null;
  IsArrived: boolean | null;
  IsConfirmed: boolean | null;
  IsCancelRequestSent: boolean | null;
  /** Derived from the seven booleans above, most specific first. */
  status: VisitStatus;
  ConfirmationStatus: number | null;
  ArrivalStatus: number | null;
  // Mode
  Telemedicine: { IsTelemedicine: boolean | null; TelemedicineMode: number | null } | null;
  TelehealthMode: number | null;
  EVisit: { IsEVisit: boolean | null } | null;
  IsInHomeVisit: boolean | null;
  // Money
  Copay: { Amount: string | null; IsPaid: boolean | null } | null;
  HasPaymentInfo: boolean | null;
  IsFullyPaid: boolean | null;
  // Records available
  IsClinicalNoteAvailable: boolean | null;
  IsNotesOnly: boolean | null;
  IsClinicalInformationAvailable: boolean | null;
  IsVisitSummaryEnabled: boolean | null;
  HasDownloadSummaryLink: boolean | null;
  IsNotViewed: boolean | null;
  IsVisitAmbulatory: boolean | null;
}

export interface UpcomingVisitStandard extends VisitStandard {
  /** Derived: which `LoadUpcoming` list the row came from. */
  bucket: VisitBucket;
}

export interface UpcomingVisitsStandard {
  /** Derived: number of visits. */
  count: number;
  /** Every bucket flattened, soonest first. */
  visits: UpcomingVisitStandard[];
}

export interface PastVisitsStandard {
  /** Derived: number of visits. */
  count: number;
  /** Derived: any organization still reported `HasMoreData` on its last fetched page. */
  hasOlderVisits: boolean;
  /** Every organization's pages flattened, newest first. */
  visits: VisitStandard[];
}

/** The concise projection of one visit: what happened, when, who, where. */
export interface VisitConcise {
  Csn: string | null;
  PrimaryDate: string | null;
  IsTimeToBeDetermined: boolean | null;
  IsHideVisitTime: boolean | null;
  AdmissionDateRange: { Start: string | null; End: string | null } | null;
  DischargeDate: string | null;
  VisitTypeName: string | null;
  ChiefComplaint: string | null;
  Diagnoses: VisitDiagnosisStandard[];
  SurgicalProcedures: Array<{ Name: string | null }>;
  PrimaryProviderName: string | null;
  PrimaryDepartment: { Name: string | null };
  organizationName: string | null;
  status: VisitStatus;
  IsClinicalNoteAvailable: boolean | null;
  IsVisitSummaryEnabled: boolean | null;
}

/**
 * The epoch-millis timestamp of a raw visit: its `Instant` (`/Date(ms)/`),
 * falling back to `PrimaryDate`. Null when neither parses, so a caller can
 * keep paginating (or sort the row last) rather than stop on an odd row.
 */
export function visitInstantMs(visit: Record<string, unknown>): number | null {
  const ms = epicInstantMs(visit.Instant);
  if (ms !== null) return ms;
  const primary = text(visit.PrimaryDate);
  if (primary) {
    const t = Date.parse(primary);
    if (!Number.isNaN(t)) return t;
  }
  return null;
}

/** `status`, in PR #380's order. `isPast` is "this row came from `LoadPast`". */
export function visitStatus(visit: Record<string, unknown>, isPast: boolean): VisitStatus {
  if (bool(visit.IsCanceled)) return 'canceled';
  if (bool(visit.IsNoShow)) return 'no_show';
  if (bool(visit.LeftWithoutSeen)) return 'left_without_being_seen';
  if (bool(visit.InProgress)) return 'in_progress';
  if (bool(visit.IsArrived)) return 'arrived';
  if (isPast) return 'completed';
  if (bool(visit.IsCancelRequestSent)) return 'cancel_requested';
  if (bool(visit.IsConfirmed)) return 'confirmed';
  return 'scheduled';
}

function isObject(value: unknown): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function textOrNumber(value: unknown): string | number | null {
  return typeof value === 'string' ? value : num(value);
}

function named(value: unknown): { Name: string | null } {
  return { Name: textOrNull(rec(value).Name) };
}

function instructions(value: unknown): Array<{ Text: string | null }> {
  return list(value).map((i) => ({ Text: textOrNull(rec(i).Text) }));
}

function department(value: unknown): VisitDepartmentStandard {
  const d = rec(value);
  return {
    Name: textOrNull(d.Name),
    Address: strings(d.Address),
    PhoneNumber: textOrNull(d.PhoneNumber),
    Specialty: { Title: textOrNull(rec(d.Specialty).Title) },
    Instructions: instructions(d.Instructions),
    ArrivalLocation: textOrNull(d.ArrivalLocation),
    TimeZone: textOrNull(d.TimeZone),
  };
}

function provider(value: unknown): VisitProviderStandard {
  const p = rec(value);
  const d = p.Department;
  return {
    Name: textOrNull(p.Name),
    Department: isObject(d)
      ? { Name: textOrNull(rec(d).Name), Address: strings(rec(d).Address), PhoneNumber: textOrNull(rec(d).PhoneNumber) }
      : null,
  };
}

/**
 * One raw visit row → the standard visit. `isPast` feeds `status`.
 * `containerOrganizationName` is the `LoadPast` organization container's
 * name, used only when the row carries no `Organization.OrganizationName`
 * of its own — the same fact, one level up.
 */
export function visitStandard(value: unknown, isPast: boolean, containerOrganizationName: string | null = null): VisitStandard {
  const v = rec(value);
  const admission = v.AdmissionDateRange;
  const preadmission = v.PreadmissionLocation;
  const telemedicine = v.Telemedicine;
  const evisit = v.EVisit;
  const copay = v.Copay;
  return {
    Csn: textOrNull(v.Csn),
    CsnForECheckIn: textOrNull(v.CsnForECheckIn),
    Id: textOrNull(v.Id),
    ReferenceID: textOrNull(v.ReferenceID),

    Instant: textOrNull(v.Instant),
    instantISO: isoFromMs(epicInstantMs(v.Instant)),
    PrimaryDate: textOrNull(v.PrimaryDate),
    TimeZone: textOrNull(v.TimeZone),
    IsTimeToBeDetermined: boolOrNull(v.IsTimeToBeDetermined),
    IsHideVisitTime: boolOrNull(v.IsHideVisitTime),
    DurationInMinutes: num(v.DurationInMinutes),
    HasDuration: boolOrNull(v.HasDuration),
    ArrivalTime: textOrNull(v.ArrivalTime),
    EarlyArrivalReason: textOrNull(v.EarlyArrivalReason),
    AdmissionDateRange: isObject(admission)
      ? { Start: textOrNull(rec(admission).Start), End: textOrNull(rec(admission).End) }
      : null,
    DischargeDate: textOrNull(v.DischargeDate),
    RescheduledDatString: textOrNull(v.RescheduledDatString),

    VisitTypeName: textOrNull(v.VisitTypeName),
    IsUsingFallbackVisitTypeName: boolOrNull(v.IsUsingFallbackVisitTypeName),
    EncounterType: num(v.EncounterType),
    EncounterIsSurgery: boolOrNull(v.EncounterIsSurgery),
    EncounterIsEDVisit: boolOrNull(v.EncounterIsEDVisit),
    IsPreadmission: boolOrNull(v.IsPreadmission),
    IsHovPreadmission: boolOrNull(v.IsHovPreadmission),
    IsResidentialMed: boolOrNull(v.IsResidentialMed),
    ChiefComplaint: textOrNull(v.ChiefComplaint),
    Diagnoses: list(v.Diagnoses).map((d) => ({
      Code: textOrNull(rec(d).Code),
      Description: textOrNull(rec(d).Description),
    })),
    SurgicalProcedures: list(v.SurgicalProcedures).map((p) => ({
      Name: textOrNull(rec(p).Name),
      Instructions: textOrNull(rec(p).Instructions),
      Providers: list(rec(p).Providers).map(named),
    })),
    Cases: list(v.Cases).map((c) => ({
      CaseId: textOrNull(rec(c).CaseId),
      Description: textOrNull(rec(c).Description),
    })),
    ComponentVisits: list(v.ComponentVisits).map((c) => ({
      Csn: textOrNull(rec(c).Csn),
      VisitTypeName: textOrNull(rec(c).VisitTypeName),
      PrimaryDate: textOrNull(rec(c).PrimaryDate),
    })),
    HasComponentVisits: boolOrNull(v.HasComponentVisits),
    PatientNextStepInstructions: textOrNull(v.PatientNextStepInstructions),
    EpisodeDetails: { GestationalAge: textOrNull(rec(v.EpisodeDetails).GestationalAge) },
    SurgeryTimeOfDay: textOrNumber(v.SurgeryTimeOfDay),

    PrimaryProviderName: textOrNull(v.PrimaryProviderName),
    PrimaryProvider: isObject(v.PrimaryProvider) ? named(v.PrimaryProvider) : null,
    Providers: list(v.Providers).map(provider),
    OtherProviders: list(v.OtherProviders).map(named),
    GuestPatientFirstName: textOrNull(v.GuestPatientFirstName),

    PrimaryDepartment: department(v.PrimaryDepartment),
    PreadmissionLocation: isObject(preadmission)
      ? {
          Name: textOrNull(rec(preadmission).Name),
          Address: strings(rec(preadmission).Address),
          PhoneNumber: textOrNull(rec(preadmission).PhoneNumber),
          Instructions: instructions(rec(preadmission).Instructions),
          ArrivalLocation: textOrNull(rec(preadmission).ArrivalLocation),
        }
      : null,
    organizationName: textOrNull(rec(v.Organization).OrganizationName) ?? containerOrganizationName,

    IsCanceled: boolOrNull(v.IsCanceled),
    IsNoShow: boolOrNull(v.IsNoShow),
    LeftWithoutSeen: boolOrNull(v.LeftWithoutSeen),
    InProgress: boolOrNull(v.InProgress),
    IsArrived: boolOrNull(v.IsArrived),
    IsConfirmed: boolOrNull(v.IsConfirmed),
    IsCancelRequestSent: boolOrNull(v.IsCancelRequestSent),
    status: visitStatus(v, isPast),
    ConfirmationStatus: num(v.ConfirmationStatus),
    ArrivalStatus: num(v.ArrivalStatus),

    Telemedicine: isObject(telemedicine)
      ? {
          IsTelemedicine: boolOrNull(rec(telemedicine).IsTelemedicine),
          TelemedicineMode: num(rec(telemedicine).TelemedicineMode),
        }
      : null,
    TelehealthMode: num(v.TelehealthMode),
    EVisit: isObject(evisit) ? { IsEVisit: boolOrNull(rec(evisit).IsEVisit) } : null,
    IsInHomeVisit: boolOrNull(v.IsInHomeVisit),

    Copay: isObject(copay) ? { Amount: textOrNull(rec(copay).Amount), IsPaid: boolOrNull(rec(copay).IsPaid) } : null,
    HasPaymentInfo: boolOrNull(v.HasPaymentInfo),
    IsFullyPaid: boolOrNull(v.IsFullyPaid),

    IsClinicalNoteAvailable: boolOrNull(v.IsClinicalNoteAvailable),
    IsNotesOnly: boolOrNull(v.IsNotesOnly),
    IsClinicalInformationAvailable: boolOrNull(v.IsClinicalInformationAvailable),
    IsVisitSummaryEnabled: boolOrNull(v.IsVisitSummaryEnabled),
    HasDownloadSummaryLink: boolOrNull(v.HasDownloadSummaryLink),
    IsNotViewed: boolOrNull(v.IsNotViewed),
    IsVisitAmbulatory: boolOrNull(v.IsVisitAmbulatory),
  };
}

/** The concise field list, shared by both capabilities. */
export function visitConcise(visit: VisitStandard): VisitConcise {
  return {
    Csn: visit.Csn,
    PrimaryDate: visit.PrimaryDate,
    IsTimeToBeDetermined: visit.IsTimeToBeDetermined,
    IsHideVisitTime: visit.IsHideVisitTime,
    AdmissionDateRange: visit.AdmissionDateRange,
    DischargeDate: visit.DischargeDate,
    VisitTypeName: visit.VisitTypeName,
    ChiefComplaint: visit.ChiefComplaint,
    Diagnoses: visit.Diagnoses,
    SurgicalProcedures: visit.SurgicalProcedures.map((p) => ({ Name: p.Name })),
    PrimaryProviderName: visit.PrimaryProviderName,
    PrimaryDepartment: { Name: visit.PrimaryDepartment.Name },
    organizationName: visit.organizationName,
    status: visit.status,
    IsClinicalNoteAvailable: visit.IsClinicalNoteAvailable,
    IsVisitSummaryEnabled: visit.IsVisitSummaryEnabled,
  };
}

/** Sort key: the standard row's instant, or null for "sort last". */
function standardInstantMs(visit: VisitStandard): number | null {
  return visitInstantMs({ Instant: visit.Instant, PrimaryDate: visit.PrimaryDate });
}

/** Stable sort with nulls last; `direction` 1 = ascending, -1 = descending. */
function sortByInstant<T extends VisitStandard>(visits: T[], direction: 1 | -1): T[] {
  return visits
    .map((visit, index) => ({ visit, index, ms: standardInstantMs(visit) }))
    .sort((a, b) => {
      if (a.ms === null && b.ms === null) return a.index - b.index;
      if (a.ms === null) return 1;
      if (b.ms === null) return -1;
      return (a.ms - b.ms) * direction || a.index - b.index;
    })
    .map((entry) => entry.visit);
}

const UPCOMING_BUCKETS: ReadonlyArray<[key: string, bucket: VisitBucket]> = [
  ['InProgressVisits', 'in_progress'],
  ['NextNDaysVisits', 'soon'],
  ['LaterVisitsList', 'later'],
];

export const upcomingVisitsProcessor: Processor<UpcomingVisitsStandard | null> = {
  standard(raw: RawResponse): UpcomingVisitsStandard | null {
    const body = findRequest(raw, 'LoadUpcoming')?.body;
    // Errors pass through (rule 7): a literal null is returned as null.
    if (body === null || body === undefined) return null;
    const container = rec(body);
    const visits: UpcomingVisitStandard[] = [];
    for (const [key, bucket] of UPCOMING_BUCKETS) {
      for (const row of list(container[key])) visits.push({ ...visitStandard(row, false), bucket });
    }
    const sorted = sortByInstant(visits, 1);
    return { count: sorted.length, visits: sorted };
  },
  concise(standard) {
    if (standard === null) return null;
    return {
      count: standard.count,
      visits: standard.visits.map((visit) => ({ ...visitConcise(visit), bucket: visit.bucket })),
    };
  },
};

/**
 * A row's identity across pages. A stuck continuation cursor hands back the
 * page just fetched; the scraper stops on it but the page is still in the
 * envelope, so the same visit must not be counted twice.
 */
function visitKey(orgId: string, visit: Record<string, unknown>): string | null {
  const parts = [text(visit.Id), text(visit.Csn), text(visit.Instant), text(visit.PrimaryDate)];
  if (parts.every((p) => p === '')) return null;
  return [orgId, ...parts].join(' ');
}

export const pastVisitsProcessor: Processor<PastVisitsStandard | null> = {
  standard(raw: RawResponse): PastVisitsStandard | null {
    const pages = findRequests(raw, 'LoadPast');
    if (pages.length === 0) return null;
    // Errors pass through (rule 7): a literal null first page is returned as null.
    if (pages[0]!.body === null) return null;

    const visits: VisitStandard[] = [];
    const seen = new Set<string>();
    // Last-fetched page wins per organization: a page's HasMoreData describes
    // what lies beyond THAT page.
    const hasMoreByOrg = new Map<string, boolean>();

    for (const page of pages) {
      const orgs = rec(rec(page.body).List);
      for (const [orgId, orgPage] of Object.entries(orgs)) {
        const org = rec(orgPage);
        const orgName = textOrNull(rec(org.Organization).OrganizationName);
        hasMoreByOrg.set(orgId, bool(org.HasMoreData));
        for (const row of list(org.List)) {
          const key = visitKey(orgId, rec(row));
          if (key !== null) {
            if (seen.has(key)) continue;
            seen.add(key);
          }
          visits.push(visitStandard(row, true, orgName));
        }
      }
    }

    const sorted = sortByInstant(visits, -1);
    return {
      count: sorted.length,
      hasOlderVisits: [...hasMoreByOrg.values()].some(Boolean),
      visits: sorted,
    };
  },
  concise(standard) {
    if (standard === null) return null;
    return {
      count: standard.count,
      hasOlderVisits: standard.hasOlderVisits,
      visits: standard.visits.map(visitConcise),
    };
  },
};
