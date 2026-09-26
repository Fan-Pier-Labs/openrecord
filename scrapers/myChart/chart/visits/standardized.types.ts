/**
 * What the `visits` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

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
