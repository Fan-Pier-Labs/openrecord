/**
 * Shapes seen on a real instance that the capture harness never got to record.
 *
 * A container that was `null` (or an empty array) on all three captured
 * instances gives the harness nothing to describe, so `shapes.generated.ts`
 * types it `unknown`. That is honest, but it is not all we know: the scraper's
 * original hand-written response types, written in the first commit by reading
 * live MyChart responses in a browser, described several of those containers.
 * This file is where that knowledge lives now, and the generator merges it in.
 *
 * **These are weaker evidence than a capture** — one developer's reading of one
 * account at one point in time, never re-confirmed by the harness. Every entry
 * says where it came from. When a capture finally observes one of these
 * populated, the capture wins and the entry here goes.
 *
 * Fragments are written in the same language as `realShapes.ts`: structure
 * only, every leaf a neutral default, so the generator renders them the same
 * way. An entry replaces **every** occurrence of that key in the shape (a visit
 * row is repeated across `LaterVisitsList`, `NextNDaysVisits`,
 * `InProgressVisits` and the past-visit buckets); the generator counts the
 * sites it hit, and an entry that matches nothing fails the build rather than
 * rotting silently.
 *
 * Tracked in https://github.com/Fan-Pier-Labs/openrecord/issues/484.
 */

/** Fragments keyed by generated shape name, then by the field they replace. */
export const OBSERVED: Record<string, Record<string, unknown>> = {
  // Source: the `TelemedicineInfo`, `EVisitInfo`, `CopayInfo`, `CaseInfo`,
  // `ComponentVisit` and admission-range interfaces in the deleted
  // `chart/visits/types.ts` (first commit, cafcdff5). `visits.processor.ts`
  // reads exactly these fields and already guards every one with `isObject`,
  // which is why it kept working while the type said `unknown`.
  VisitsLoadUpcoming: {
    Telemedicine: { IsTelemedicine: false, TelemedicineUrl: null, TelemedicineMode: 0 },
    EVisit: { IsEVisit: false },
    Copay: { Amount: '', IsPaid: false },
    Cases: [{ CaseId: '', Description: '' }],
    ComponentVisits: [{ Csn: '', VisitTypeName: '', PrimaryDate: '' }],
    AdmissionDateRange: { Start: '', End: '' },
  },
  VisitsLoadPast: {
    Telemedicine: { IsTelemedicine: false, TelemedicineUrl: null, TelemedicineMode: 0 },
    EVisit: { IsEVisit: false },
    Copay: { Amount: '', IsPaid: false },
    Cases: [{ CaseId: '', Description: '' }],
    ComponentVisits: [{ Csn: '', VisitTypeName: '', PrimaryDate: '' }],
    AdmissionDateRange: { Start: '', End: '' },
  },

  // Source: the `EstimateInfo` interface in `chart/bills/types.ts` (first
  // commit). `bills.processor.ts:418` reads both fields off it.
  BillingGetVisits: {
    EstimateInfo: { EstimateAmount: '', EstimateStatus: 0 },
  },
};
