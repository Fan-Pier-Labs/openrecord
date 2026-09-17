/**
 * What the `healthSummary` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

export interface MeasurementStandard {
  value: string | null;
  dateRecorded: string | null;
}

export interface VisitPointerStandard {
  date: string | null;
  visitType: string | null;
}

export interface HealthSummaryStandard {
  header: {
    patientAge: string | null;
    bloodType: string | null;
    height: MeasurementStandard;
    weight: MeasurementStandard;
  };
  patientFirstName: string | null;
  isPatientAdmitted: boolean | null;
  /** Uncaptured element shapes; passed through. */
  conditionList: unknown[];
  journeyList: unknown[];
  actionPlans: unknown[];
  lastVisit: VisitPointerStandard;
  nextVisit: VisitPointerStandard;
}
